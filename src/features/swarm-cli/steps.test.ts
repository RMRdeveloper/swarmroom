/** Tests for session-driven start, step, and status with a scripted CLI. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { CommandRunner, SpawnResult } from '../../swarm/adapters/process.ts';
import { loadRun } from '../../swarm/run-store.ts';

import { runSwarmStart, runSwarmStatus, runSwarmStep } from './steps.ts';

/** Replays one canned stdout per command name. */
class FakeRunner implements CommandRunner {
  private readonly outputs: readonly string[];
  private calls = 0;
  constructor(outputs: readonly string[]) {
    this.outputs = outputs;
  }

  run(): Promise<SpawnResult> {
    const stdout = this.outputs[this.calls] ?? '';
    this.calls += 1;
    return Promise.resolve({ stdout, stderr: '' });
  }
}

/** pi JSONL envelope carrying one assistant text payload. */
function piText(payload: string): string {
  return `{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":${JSON.stringify(payload)}}]}}`;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'swarm-steps-'));
}

describe('session-driven swarm commands', () => {
  it('starts a trivial run and reports implement as next', async () => {
    const dir = tempDir();
    const run = await runSwarmStart(
      {
        kind: 'swarm-start',
        dir,
        harness: 'pi',
        request: 'Fix typo',
        trivial: true,
        addsDependency: false,
        designDecision: false,
      },
      { newRunId: () => 'swarm-test' },
    );
    assert.equal(run.id, 'swarm-test');
    assert.equal(run.status, 'running');
    assert.deepEqual(loadRun(dir, 'swarm-test'), run);
  });

  it('fails fast when non-trivial start has no settled understanding', async () => {
    await assert.rejects(
      runSwarmStart(
        {
          kind: 'swarm-start',
          dir: tempDir(),
          harness: 'pi',
          request: 'Add auth',
          addsDependency: false,
          designDecision: false,
        },
        { newRunId: () => 'swarm-test' },
      ),
      /settled/,
    );
  });

  it('steps a trivial run through implementer then verifier', async () => {
    const dir = tempDir();
    await runSwarmStart(
      {
        kind: 'swarm-start',
        dir,
        harness: 'pi',
        request: 'Fix typo',
        trivial: true,
        addsDependency: false,
        designDecision: false,
      },
      { newRunId: () => 'swarm-test' },
    );
    const runner = new FakeRunner([
      piText(JSON.stringify({ filesChanged: ['a.ts'], result: 'done' })),
      piText(JSON.stringify({ findings: 'No findings', summary: 'ok' })),
    ]);
    const afterImplement = await runSwarmStep(
      { kind: 'swarm-step', dir, runId: 'swarm-test', allowWrite: false },
      { runner },
    );
    assert.equal(afterImplement.implementation.length, 1);
    const afterVerify = await runSwarmStep(
      { kind: 'swarm-step', dir, runId: 'swarm-test', allowWrite: false },
      { runner },
    );
    assert.equal(afterVerify.verification?.status, 'passed');
    const terminal = await runSwarmStep(
      { kind: 'swarm-step', dir, runId: 'swarm-test', allowWrite: false },
      { runner },
    );
    assert.equal(terminal.status, 'completed');
  });

  it('reports status without running an agent', async () => {
    const dir = tempDir();
    await runSwarmStart(
      {
        kind: 'swarm-start',
        dir,
        harness: 'pi',
        request: 'Fix typo',
        trivial: true,
        addsDependency: false,
        designDecision: false,
      },
      { newRunId: () => 'swarm-test' },
    );
    const run = runSwarmStatus({ kind: 'swarm-status', dir, runId: 'swarm-test' });
    assert.equal(run.phase, 'triage');
  });
});
