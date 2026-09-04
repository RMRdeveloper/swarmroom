/**
 * Persisted run store. One JSON file per run, nothing else.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PersistedRun } from './steps.ts';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Fresh run id in the historical `swarm-<Date.now()>` format. */
export function newRunId(): string {
  return `swarm-${String(Date.now())}`;
}

/** Fail fast on run ids that could escape the runs directory. */
function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`invalid run id: ${runId}`);
  }
}

/** Persisted file for one run inside the project directory. */
export function runFilePath(dir: string, runId: string): string {
  assertRunId(runId);
  return join(dir, '.swarmroom', 'runs', `${runId}.swarm.json`);
}

/** Save one run. Creates the runs directory when needed. */
export function saveRun(dir: string, run: PersistedRun): void {
  assertRunId(run.id);
  const path = runFilePath(dir, run.id);
  mkdirSync(join(dir, '.swarmroom', 'runs'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
}

/** Load one run. Missing files and bad ids fail fast. */
export function loadRun(dir: string, runId: string): PersistedRun {
  assertRunId(runId);
  const path = runFilePath(dir, runId);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`unknown run ${runId}: ${message}`);
  }
  try {
    return JSON.parse(raw) as PersistedRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid run file ${runId}: ${message}`);
  }
}
