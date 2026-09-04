/** Tests for swarm run argument parsing. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSwarmArgs } from './args.swarm.ts';

describe('parseSwarmArgs', () => {
  it('parses a minimal trivial run', () => {
    const parsed = parseSwarmArgs(['run', '--harness', 'pi', '--request', 'Fix typo', '--trivial']);
    assert.equal(parsed.kind, 'swarm-run');
    if (parsed.kind !== 'swarm-run') return;
    assert.equal(parsed.harness, 'pi');
    assert.equal(parsed.request, 'Fix typo');
    assert.equal(parsed.trivial, true);
    assert.equal(parsed.allowWrite, false);
  });

  it('parses a full non-trivial run', () => {
    const parsed = parseSwarmArgs([
      'run',
      '--harness',
      'opencode',
      '--request',
      'Add auth',
      '--dir',
      '/repo',
      '--model',
      'anthropic/claude',
      '--non-trivial',
      '--lines',
      '120',
      '--files',
      '4',
      '--adds-dep',
      '--design-decision',
      '--settled-file',
      'settled.md',
      '--max-passes',
      '3',
      '--timeout-s',
      '300',
      '--allow-write',
    ]);
    assert.equal(parsed.kind, 'swarm-run');
    if (parsed.kind !== 'swarm-run') return;
    assert.equal(parsed.dir, '/repo');
    assert.equal(parsed.model, 'anthropic/claude');
    assert.equal(parsed.trivial, false);
    assert.equal(parsed.lines, 120);
    assert.equal(parsed.files, 4);
    assert.equal(parsed.addsDependency, true);
    assert.equal(parsed.designDecision, true);
    assert.equal(parsed.settledFile, 'settled.md');
    assert.equal(parsed.maxPasses, 3);
    assert.equal(parsed.timeoutS, 300);
    assert.equal(parsed.allowWrite, true);
  });

  it('rejects missing harness, request, and bad harness', () => {
    for (const argv of [
      ['run', '--request', 'x'],
      ['run', '--harness', 'pi'],
      ['run', '--harness', 'cursor', '--request', 'x'],
      ['run', '--harness', 'pi', '--request', 'x', '--trivial', '--non-trivial'],
      ['run', '--harness', 'pi', '--request', 'x', '--unknown-flag'],
      ['run', '--harness', 'pi', '--request', 'x', 'extra'],
      ['status', '--harness', 'pi', '--request', 'x'],
      ['run', '--harness', 'pi', '--request', 'x', '--lines', 'many'],
      ['run', '--harness', 'pi', '--request', 'x', '--max-passes', '0'],
      [
        'run',
        '--harness',
        'pi',
        '--request',
        'x',
        '--settled-understanding',
        's',
        '--settled-file',
        'f',
      ],
    ]) {
      const parsed = parseSwarmArgs(argv);
      assert.equal(parsed.kind, 'error', `expected error for ${argv.join(' ')}`);
    }
  });
});

describe('parseSwarmArgs start/step/status', () => {
  it('parses a minimal trivial start', () => {
    const parsed = parseSwarmArgs([
      'start',
      '--harness',
      'pi',
      '--request',
      'Fix typo',
      '--trivial',
    ]);
    assert.equal(parsed.kind, 'swarm-start');
    if (parsed.kind !== 'swarm-start') return;
    assert.equal(parsed.harness, 'pi');
    assert.equal(parsed.request, 'Fix typo');
    assert.equal(parsed.trivial, true);
  });

  it('parses a non-trivial start with settled understanding', () => {
    const parsed = parseSwarmArgs([
      'start',
      '--harness',
      'opencode',
      '--request',
      'Add auth',
      '--settled-understanding',
      'Scope: auth.',
      '--max-passes',
      '3',
    ]);
    assert.equal(parsed.kind, 'swarm-start');
    if (parsed.kind !== 'swarm-start') return;
    assert.equal(parsed.settledUnderstanding, 'Scope: auth.');
    assert.equal(parsed.maxPasses, 3);
    assert.equal(parsed.trivial, undefined);
  });

  it('parses step and status', () => {
    const step = parseSwarmArgs(['step', '--run', 'swarm-1', '--dir', '/repo', '--allow-write']);
    assert.equal(step.kind, 'swarm-step');
    if (step.kind !== 'swarm-step') return;
    assert.equal(step.runId, 'swarm-1');
    assert.equal(step.allowWrite, true);
    const status = parseSwarmArgs(['status', '--run', 'swarm-1', '--dir', '/repo']);
    assert.equal(status.kind, 'swarm-status');
    if (status.kind !== 'swarm-status') return;
    assert.equal(status.runId, 'swarm-1');
  });

  it('rejects bad start, step, and status input', () => {
    for (const argv of [
      ['start', '--request', 'x'],
      ['start', '--harness', 'pi'],
      ['start', '--harness', 'pi', '--request', 'x', '--non-trivial'],
      ['start', '--harness', 'pi', '--request', 'x', '--allow-write'],
      ['start', '--harness', 'pi', '--request', 'x', 'extra'],
      ['step', '--dir', '/repo'],
      ['step', '--run', 'swarm-1', '--unknown-flag'],
      ['status', '--dir', '/repo'],
      ['status', '--run', 'swarm-1', 'extra'],
      ['deploy', '--harness', 'pi'],
    ]) {
      const parsed = parseSwarmArgs(argv);
      assert.equal(parsed.kind, 'error', `expected error for ${argv.join(' ')}`);
    }
  });
});
