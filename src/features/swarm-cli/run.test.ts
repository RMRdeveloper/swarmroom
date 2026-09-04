/** Tests for the swarm run command with a scripted harness CLI. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CommandRunner, SpawnResult } from '../../swarm/adapters/process.ts';

import { runSwarmCommand, type SwarmRunCommand } from './run.ts';

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

function trivialCommand(): SwarmRunCommand {
  return {
    kind: 'swarm-run',
    dir: '/repo',
    harness: 'pi',
    request: 'Fix typo',
    trivial: true,
    addsDependency: false,
    designDecision: false,
    allowWrite: false,
  };
}

describe('runSwarmCommand', () => {
  it('completes a trivial run through implementer and verifier', async () => {
    const runner = new FakeRunner([
      piText(JSON.stringify({ filesChanged: ['a.ts'], result: 'done' })),
      piText(JSON.stringify({ findings: 'No findings', summary: 'ok' })),
    ]);
    const status = await runSwarmCommand(trivialCommand(), { runner });
    assert.equal(status, 'completed');
  });

  it('reports verification failure without throwing', async () => {
    const runner = new FakeRunner([
      piText(JSON.stringify({ filesChanged: ['a.ts'], result: 'done' })),
      piText(
        JSON.stringify({
          findings: 'FINDING 1 | High | a.ts:1 | DRY | duplicated logic',
          summary: 'not wired',
        }),
      ),
    ]);
    const status = await runSwarmCommand(trivialCommand(), { runner });
    assert.equal(status, 'failed');
  });
});
