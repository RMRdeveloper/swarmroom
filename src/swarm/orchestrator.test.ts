/**
 * Parity tests for the orchestrated flow. No real LLM: a fake model plays back
 * scripted responses in call order, so every routing decision under test lives
 * in `SwarmOrchestrator`, never in model output.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFixerAgent } from './agents/fixer.ts';
import { createImplementerAgent } from './agents/implementer.ts';
import { createPlannerAgent } from './agents/planner.ts';
import { createReviewerAgent } from './agents/reviewer.ts';
import { createVerifierAgent } from './agents/verifier.ts';
import type { ModelProvider, ModelRequest } from './model.ts';
import { SwarmOrchestrator } from './orchestrator.ts';
import type { RunInput, TriageAnswers } from './types.ts';

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

function buildInput(overrides: Partial<RunInput> = {}): RunInput {
  return {
    request: 'Add the widget',
    harness: 'opencode',
    triage: NON_TRIVIAL,
    settledUnderstanding: 'Scope: widget only. Out of scope: styling.',
    ...overrides,
  };
}

function buildOrchestrator(model: FakeModel, options: { maxQualityPasses?: number } = {}) {
  return new SwarmOrchestrator({
    planner: createPlannerAgent({ model }),
    implementer: createImplementerAgent({ model }),
    reviewer: createReviewerAgent({ model }),
    verifier: createVerifierAgent({ model }),
    fixer: createFixerAgent({ model }),
    newRunId: () => 'test-run',
    ...(options.maxQualityPasses === undefined
      ? {}
      : { maxQualityPasses: options.maxQualityPasses }),
  });
}

describe('SwarmOrchestrator parity', () => {
  it('rejects invalid maxQualityPasses configuration', () => {
    for (const maxQualityPasses of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      0,
      -1,
    ]) {
      assert.throws(
        () => buildOrchestrator(new FakeModel(), { maxQualityPasses }),
        /maxQualityPasses must be a finite integer of at least 1/,
      );
    }
  });

  it('completes a successful run: planner -> implementer -> reviewer -> verifier', async () => {
    const model = new FakeModel();
    model.push(plannerResult(), implemented(), CLEAN, verifiedClean());
    const result = await buildOrchestrator(model).run(buildInput());

    assert.equal(result.status, 'completed');
    assert.equal(result.run.plan?.tasks.length, 1);
    assert.equal(result.run.implementation?.length, 1);
    assert.equal(result.run.review?.status, 'approved');
    assert.equal(result.run.verification?.status, 'passed');
    assert.equal(result.run.qualityPasses, 0);
  });

  it('accepts planner tasks with valid optional fields', async () => {
    const model = new FakeModel();
    model.push(
      {
        ...plannerResult(),
        tasks: [
          {
            id: 'T1',
            title: 'Add the widget',
            description: 'Implement the widget runtime.',
            agent: 'implementation specialist',
            files: ['src/foo.ts'],
            acceptance: ['The widget is available to callers.'],
          },
        ],
      },
      implemented(),
      CLEAN,
      verifiedClean(),
    );
    const result = await buildOrchestrator(model).run(buildInput());

    assert.equal(result.status, 'completed');
  });

  it('rejects planner tasks with malformed required or optional fields', async () => {
    const malformedTasks = [
      { id: '', title: 'Add the widget' },
      { id: 'T1', title: '' },
      { id: 'T1', title: 'Add the widget', description: 1 },
      { id: 'T1', title: 'Add the widget', agent: false },
      { id: 'T1', title: 'Add the widget', files: 'src/foo.ts' },
      { id: 'T1', title: 'Add the widget', files: ['src/foo.ts', 1] },
      { id: 'T1', title: 'Add the widget', acceptance: 'The widget works.' },
      { id: 'T1', title: 'Add the widget', acceptance: ['The widget works.', 1] },
    ];

    for (const task of malformedTasks) {
      const model = new FakeModel();
      model.push({ ...plannerResult(), tasks: [task] });
      const result = await buildOrchestrator(model).run(buildInput());

      assert.equal(result.status, 'failed');
      assert.match(result.run.error ?? '', /planner result has malformed tasks/);
    }
  });

  it('review rejection triggers a fixer pass and re-review before completing', async () => {
    const model = new FakeModel();
    model.push(
      plannerResult(),
      implemented(),
      BLOCKING,
      verifiedClean(),
      { fixed: ['1:src/foo.ts:12'], result: 'deduped' },
      CLEAN,
    );
    const result = await buildOrchestrator(model).run(buildInput());

    assert.equal(result.status, 'completed');
    assert.equal(model.calls('fixing findings'), 1);
    assert.equal(model.calls('standards reviewer'), 2);
    assert.equal(result.run.qualityPasses, 1);
  });

  it('review approval advances the workflow into verification', async () => {
    const model = new FakeModel();
    model.push(plannerResult(), implemented(), CLEAN, verifiedClean());
    const result = await buildOrchestrator(model).run(buildInput());

    assert.equal(result.status, 'completed');
    assert.equal(model.calls('standards reviewer'), 1);
    assert.equal(model.calls('skeptical validator'), 1);
    assert.equal(result.run.verification?.status, 'passed');
  });

  it('verification failure fails the run once passes are exhausted', async () => {
    const model = new FakeModel();
    model.push(plannerResult(), implemented(), CLEAN, {
      findings: BLOCKING,
      summary: 'not wired',
    });
    const result = await buildOrchestrator(model, { maxQualityPasses: 1 }).run(buildInput());

    assert.equal(result.status, 'failed');
    assert.match(result.run.error ?? '', /verification failed/);
  });

  it('maximum quality passes prevents infinite loops', async () => {
    const model = new FakeModel();
    model.push(
      plannerResult(),
      implemented(),
      BLOCKING,
      verifiedClean(),
      { fixed: [], result: 'could not fix' },
      BLOCKING,
    );
    const result = await buildOrchestrator(model, { maxQualityPasses: 2 }).run(buildInput());

    assert.equal(result.status, 'failed');
    assert.equal(model.calls('standards reviewer'), 2);
    assert.equal(model.calls('fixing findings'), 1);
    assert.match(result.run.error ?? '', /still requests changes/);
  });

  it('agent failure propagates as a failed run with the cause', async () => {
    const model = new FakeModel();
    model.push(new Error('model is down'));
    const result = await buildOrchestrator(model).run(buildInput());

    assert.equal(result.status, 'failed');
    assert.equal(result.run.error, 'model is down');
    assert.equal(result.run.status, 'failed');
  });

  it('trivial requests skip planner and run implementer -> verifier only', async () => {
    const model = new FakeModel();
    model.push(implemented(), verifiedClean());
    const result = await buildOrchestrator(model).run(
      buildInput({ triage: TRIVIAL, settledUnderstanding: undefined }),
    );

    assert.equal(result.status, 'completed');
    assert.equal(model.calls('planning engineer'), 0);
    assert.equal(model.calls('standards reviewer'), 0);
    assert.equal(result.run.plan, undefined);
    assert.equal(result.run.verification?.status, 'passed');
  });

  it('non-trivial requests without settled understanding fail at the grilling gate', async () => {
    const model = new FakeModel();
    const result = await buildOrchestrator(model).run(
      buildInput({ settledUnderstanding: undefined }),
    );

    assert.equal(result.status, 'failed');
    assert.match(result.run.error ?? '', /grilling gate/);
    assert.equal(model.requests.length, 0);
  });
});
