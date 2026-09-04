/** Tests for the persisted run store. Uses temp dirs, no network. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { loadRun, newRunId, runFilePath, saveRun } from './run-store.ts';
import { createPersistedRun } from './steps.ts';
import type { TriageAnswers } from './types.ts';

const TRIVIAL: TriageAnswers = {
  estimatedLines: 1,
  fileCount: 1,
  addsDependency: false,
  hasDesignDecision: false,
  userConfirmedTrivial: true,
};

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'swarm-store-'));
}

describe('run-store', () => {
  it('creates timestamped run ids', () => {
    assert.match(newRunId(), /^swarm-\d+$/);
  });

  it('saves and loads a run round-trip', () => {
    const dir = tempDir();
    const run = createPersistedRun({
      id: 'swarm-123',
      request: 'Fix typo',
      harness: 'pi',
      dir,
      maxQualityPasses: 2,
      triage: TRIVIAL,
    });
    saveRun(dir, run);
    assert.equal(
      runFilePath(dir, 'swarm-123').endsWith('.swarmroom/runs/swarm-123.swarm.json'),
      true,
    );
    assert.deepEqual(loadRun(dir, 'swarm-123'), run);
  });

  it('fails fast on bad run id charset', () => {
    const dir = tempDir();
    assert.throws(() => runFilePath(dir, '../escape'), /invalid run id/);
    assert.throws(() => loadRun(dir, 'bad/id'), /invalid run id/);
    const run = createPersistedRun({
      id: 'bad/id',
      request: 'x',
      harness: 'pi',
      dir,
      maxQualityPasses: 2,
      triage: TRIVIAL,
    });
    assert.throws(() => {
      saveRun(dir, run);
    }, /invalid run id/);
  });

  it('fails fast on missing run files', () => {
    assert.throws(() => loadRun(tempDir(), 'swarm-missing'), /unknown run/);
  });
});
