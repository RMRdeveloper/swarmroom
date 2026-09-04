/** Session-driven swarm commands: start, step, and status over persisted runs. */
import { readFile } from 'node:fs/promises';

import type { ParseResult } from '../../shared/kernel/tasks-cli-types.ts';
import type { CommandRunner } from '../../swarm/adapters/process.ts';
import { createSwarmRuntime } from '../../swarm/adapters/wiring.ts';
import { loadRun, newRunId, saveRun } from '../../swarm/run-store.ts';
import { advanceRun, createPersistedRun, nextAction } from '../../swarm/steps.ts';
import type { PersistedRun } from '../../swarm/steps.ts';
import { isTrivial } from '../../swarm/types.ts';
import type { TriageAnswers } from '../../swarm/types.ts';

/** swarm-start options extracted from CLI parsing. */
export type SwarmStartCommand = Extract<ParseResult, { kind: 'swarm-start' }>;

/** swarm-step options extracted from CLI parsing. */
export type SwarmStepCommand = Extract<ParseResult, { kind: 'swarm-step' }>;

/** swarm-status options extracted from CLI parsing. */
export type SwarmStatusCommand = Extract<ParseResult, { kind: 'swarm-status' }>;

/** Resolve the settled understanding from a flag or a file. */
async function resolveSettled(options: {
  readonly settledUnderstanding?: string;
  readonly settledFile?: string;
}): Promise<string | undefined> {
  if (options.settledUnderstanding !== undefined) return options.settledUnderstanding;
  if (options.settledFile === undefined) return undefined;
  try {
    return await readFile(options.settledFile, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read settled file ${options.settledFile}: ${message}`);
  }
}

/** Print one human-readable persisted run summary. */
function printPersistedSummary(run: PersistedRun): void {
  console.log(`Swarm run ${run.id}: ${run.status}`);
  console.log(`  phase: ${run.phase} · quality passes: ${String(run.qualityPasses)}`);
  if (run.plan !== undefined) console.log(`  plan tasks: ${String(run.plan.tasks.length)}`);
  if (run.implementation.length > 0) {
    const files = [...new Set(run.implementation.flatMap((entry) => entry.filesChanged))];
    console.log(`  files changed: ${files.length > 0 ? files.join(', ') : '-'}`);
  }
  if (run.review !== undefined) console.log(`  review: ${run.review.status}`);
  if (run.verification !== undefined) console.log(`  verification: ${run.verification.status}`);
  if (run.error !== undefined) console.log(`  error: ${run.error}`);
}

/**
 * Start a session-driven run. Triage comes from flags only: trivial only
 * with `--trivial`, else non-trivial which needs a settled understanding.
 * Persists the run and prints the first `next:` action. No stdin prompting.
 */
export async function runSwarmStart(
  command: SwarmStartCommand,
  deps: { readonly newRunId?: () => string } = {},
): Promise<PersistedRun> {
  const triage: TriageAnswers = {
    estimatedLines: command.lines ?? 0,
    fileCount: command.files ?? 1,
    addsDependency: command.addsDependency ?? false,
    hasDesignDecision: command.designDecision ?? false,
    userConfirmedTrivial: command.trivial === true,
  };
  const settledUnderstanding = await resolveSettled(command);
  if (!isTrivial(triage)) {
    const settled = settledUnderstanding?.trim() ?? '';
    if (settled.length === 0) {
      throw new Error(
        'swarm start needs --settled-understanding or --settled-file for non-trivial runs — grill first in chat',
      );
    }
  }
  const run = createPersistedRun({
    id: (deps.newRunId ?? newRunId)(),
    request: command.request,
    harness: command.harness,
    dir: command.dir,
    ...(command.model === undefined ? {} : { model: command.model }),
    ...(command.timeoutS === undefined ? {} : { timeoutMs: command.timeoutS * 1000 }),
    maxQualityPasses: command.maxPasses ?? 2,
    triage,
    ...(settledUnderstanding === undefined ? {} : { settledUnderstanding }),
  });
  saveRun(command.dir, run);
  console.log(`run: ${run.id}`);
  printPersistedSummary(run);
  console.log(`next: ${nextAction(run)}`);
  return run;
}

/**
 * Advance one persisted agent step. Harness, dir, model, and timeout come
 * from the stored run unless overridden by flags. Saves before returning.
 */
export async function runSwarmStep(
  command: SwarmStepCommand,
  deps: { readonly runner?: CommandRunner } = {},
): Promise<PersistedRun> {
  const stored = loadRun(command.dir, command.runId);
  const effectiveModel = command.model ?? stored.model;
  const effectiveTimeoutMs =
    command.timeoutS === undefined ? stored.timeoutMs : command.timeoutS * 1000;
  const effective: PersistedRun = {
    ...stored,
    ...(effectiveModel === undefined ? {} : { model: effectiveModel }),
    ...(effectiveTimeoutMs === undefined ? {} : { timeoutMs: effectiveTimeoutMs }),
  };
  const runtime = createSwarmRuntime({
    harness: stored.harness,
    dir: stored.dir,
    ...(effectiveModel === undefined ? {} : { model: effectiveModel }),
    ...(effectiveTimeoutMs === undefined ? {} : { timeoutMs: effectiveTimeoutMs }),
    maxQualityPasses: stored.maxQualityPasses,
    allowWrite: command.allowWrite,
    runner: deps.runner,
  });
  const updated = await advanceRun(effective, {
    planner: runtime.planner,
    implementer: runtime.implementer,
    reviewer: runtime.reviewer,
    verifier: runtime.verifier,
    fixer: runtime.fixer,
  });
  saveRun(command.dir, updated);
  printPersistedSummary(updated);
  console.log(`next: ${nextAction(updated)}`);
  return updated;
}

/** Show persisted run phase and routing. Read-only, never runs an agent. */
export function runSwarmStatus(command: SwarmStatusCommand): PersistedRun {
  const run = loadRun(command.dir, command.runId);
  console.log(`run: ${run.id}`);
  console.log(`  phase: ${run.phase}`);
  console.log(`  current agent: ${run.currentAgent ?? '-'}`);
  console.log(`  quality passes: ${String(run.qualityPasses)}`);
  console.log(`next: ${nextAction(run)}`);
  return run;
}
