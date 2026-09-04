/** Tests for the single-step pipeline core. No real LLM. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFixerAgent } from './agents/fixer.ts';
import { createImplementerAgent } from './agents/implementer.ts';
import { createPlannerAgent } from './agents/planner.ts';
import { createReviewerAgent } from './agents/reviewer.ts';
import { createVerifierAgent } from './agents/verifier.ts';
import type { ModelProvider, ModelRequest } from './model.ts';
import { advanceRun, createPersistedRun, nextAction } from './steps.ts';
import type { PersistedRun, StepAgents } from './steps.ts';
import type { TriageAnswers } from './types.ts';

/** Fake model: replays queued responses, records every request. */
class FakeModel implements ModelProvider {
  private readonly queue: unknown[] = [];
  readonly requests: ModelRequest[] = [];

  push(...responses: unknown[]): void {
    this.queue.push(...responses);
  }

  generate<T>(request: ModelRequest): Promise<T> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error('fake model is out of scripted responses'));
    }
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next as T);
  }

  /** How many times the agent owning `marker` was invoked. */
  calls(marker: string): number {
    return this.requests.filter((request) => request.instructions.includes(marker)).length;
  }
}

const TRIVIAL: TriageAnswers = {
  estimatedLines: 5,
  fileCount: 1,
  addsDependency: false,
  hasDesignDecision: false,
  userConfirmedTrivial: true,
};

const NON_TRIVIAL: TriageAnswers = {
  estimatedLines: 100,
  fileCount: 3,
  addsDependency: false,
  hasDesignDecision: true,
  userConfirmedTrivial: false,
};

const BLOCKING = 'FINDING 1 | High | src/foo.ts:12 | DRY | duplicated logic';
const CLEAN = 'No findings';

function plannerResult() {
  return {
    plan: 'Add the widget.',
    tasks: [{ id: 'T1', title: 'Add the widget' }],
    verification: ['npm test'],
  };
}

function implemented() {
  return { filesChanged: ['src/foo.ts'], result: 'widget added' };
}

function verifiedClean() {
  return { findings: CLEAN, summary: 'all wired and passing' };
}

function trivialRun(): PersistedRun {
  return createPersistedRun({
    id: 'test-run',
    request: 'Fix typo',
    harness: 'pi',
    dir: '/repo',
    maxQualityPasses: 2,
    triage: TRIVIAL,
  });
}

function nontrivialRun(maxQualityPasses = 2): PersistedRun {
  return createPersistedRun({
    id: 'test-run',
    request: 'Add the widget',
    harness: 'pi',
    dir: '/repo',
    maxQualityPasses,
    triage: NON_TRIVIAL,
    settledUnderstanding: 'Scope: widget only.',
  });
}

function agentsFor(model: FakeModel): StepAgents {
  return {
    planner: createPlannerAgent({ model }),
    implementer: createImplementerAgent({ model }),
    reviewer: createReviewerAgent({ model }),
    verifier: createVerifierAgent({ model }),
    fixer: createFixerAgent({ model }),
  };
}

describe('step core', () => {
  it('rejects a bad pass cap when creating a run', () => {
    assert.throws(
      () =>
        createPersistedRun({
          id: 'x',
          request: 'r',
          harness: 'pi',
          dir: '/repo',
          maxQualityPasses: 0,
          triage: TRIVIAL,
        }),
      /maxQualityPasses must be a finite integer/,
    );
  });

  it('routes trivial runs implement then verify then done without review', async () => {
    const model = new FakeModel();
    model.push(implemented(), verifiedClean());
    const agents = agentsFor(model);
    let run = trivialRun();
    assert.equal(nextAction(run), 'implement T1');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'verify');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'done');
    run = await advanceRun(run, agents);
    assert.equal(run.status, 'completed');
    assert.equal(run.phase, 'done');
    assert.equal(model.calls('standards reviewer'), 0);
  });

  it('fails trivial runs directly on verification failure', async () => {
    const model = new FakeModel();
    model.push(implemented(), {
      findings: BLOCKING,
      summary: 'not wired',
    });
    const agents = agentsFor(model);
    let run = trivialRun();
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'failed:verification failed: not wired');
    run = await advanceRun(run, agents);
    assert.equal(run.status, 'failed');
    assert.equal(run.error, 'verification failed: not wired');
  });

  it('routes non-trivial runs plan through verify to done', async () => {
    const model = new FakeModel();
    model.push(plannerResult(), implemented(), CLEAN, verifiedClean());
    const agents = agentsFor(model);
    let run = nontrivialRun();
    assert.equal(nextAction(run), 'plan');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'implement T1');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'review');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'verify');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'done');
    run = await advanceRun(run, agents);
    assert.equal(run.status, 'completed');
    assert.equal(run.qualityPasses, 0);
  });

  it('runs fixer once on review rejection then completes', async () => {
    const model = new FakeModel();
    model.push(
      plannerResult(),
      implemented(),
      BLOCKING,
      verifiedClean(),
      { fixed: ['1:src/foo.ts:12'], result: 'deduped' },
      CLEAN,
    );
    const agents = agentsFor(model);
    let run = nontrivialRun();
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'verify');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'fix');
    run = await advanceRun(run, agents);
    assert.equal(run.qualityPasses, 1);
    assert.equal(nextAction(run), 'review');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'done');
  });

  it('skips re-verify when the verifier passed before the fix', async () => {
    const model = new FakeModel();
    model.push(
      plannerResult(),
      implemented(),
      BLOCKING,
      verifiedClean(),
      { fixed: ['1:src/foo.ts:12'], result: 'deduped' },
      CLEAN,
    );
    const agents = agentsFor(model);
    let run = nontrivialRun();
    for (let index = 0; index < 4; index += 1) run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'review');
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'done');
    assert.equal(model.calls('skeptical validator'), 1);
    assert.equal(model.calls('standards reviewer'), 2);
  });

  it('fails with verification wording once passes are exhausted', async () => {
    const model = new FakeModel();
    model.push(plannerResult(), implemented(), CLEAN, {
      findings: BLOCKING,
      summary: 'not wired',
    });
    const agents = agentsFor(model);
    let run = nontrivialRun(1);
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    run = await advanceRun(run, agents);
    assert.equal(nextAction(run), 'failed:verification failed: not wired');
    run = await advanceRun(run, agents);
    assert.equal(run.status, 'failed');
  });

  it('fails with review wording when review still blocks at the cap', async () => {
    const model = new FakeModel();
    model.push(
      plannerResult(),
      implemented(),
      BLOCKING,
      verifiedClean(),
      { fixed: [], result: 'could not fix' },
      BLOCKING,
    );
    const agents = agentsFor(model);
    let run = nontrivialRun(2);
    for (let index = 0; index < 6; index += 1) run = await advanceRun(run, agents);
    const action = nextAction(run);
    assert.match(action, /^failed:review still requests changes:/);
    run = await advanceRun(run, agents);
    assert.equal(run.status, 'failed');
  });

  it('throws at the grilling gate without settled understanding', () => {
    const run = createPersistedRun({
      id: 'test-run',
      request: 'Add the widget',
      harness: 'pi',
      dir: '/repo',
      maxQualityPasses: 2,
      triage: NON_TRIVIAL,
    });
    assert.throws(() => nextAction(run), /grilling gate/);
  });

  it('converts agent failure into a failed run', async () => {
    const model = new FakeModel();
    model.push(new Error('model is down'));
    const agents = agentsFor(model);
    const run = await advanceRun(nontrivialRun(), agents);
    assert.equal(run.status, 'failed');
    assert.equal(run.error, 'model is down');
  });

  it('leaves terminal runs untouched', async () => {
    const model = new FakeModel();
    const agents = agentsFor(model);
    let run = trivialRun();
    run = { ...run, phase: 'done', status: 'completed' };
    assert.equal(nextAction(run), 'done');
    assert.equal(await advanceRun(run, agents), run);
  });
});
