/** Executes the orchestrated swarm pipeline through one harness CLI. */
import { readFile } from 'node:fs/promises';

import type { ParseResult } from '../../shared/kernel/tasks-cli-types.ts';
import type { CommandRunner } from '../../swarm/adapters/process.ts';
import { createSwarmRuntime } from '../../swarm/adapters/wiring.ts';
import { answerConfirmsTrivial, trivialConfirmQuestion } from '../../swarm/harness.ts';
import type { TriageAnswers } from '../../swarm/types.ts';

/** swarm-run options extracted from CLI parsing. */
export type SwarmRunCommand = Extract<ParseResult, { kind: 'swarm-run' }>;

/** Resolve the settled understanding from a flag or a file. */
async function resolveSettled(command: SwarmRunCommand): Promise<string | undefined> {
  if (command.settledUnderstanding !== undefined) return command.settledUnderstanding;
  if (command.settledFile === undefined) return undefined;
  try {
    return await readFile(command.settledFile, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read settled file ${command.settledFile}: ${message}`);
  }
}

/** Confirm trivial scope via flag, terminal gate, or non-interactive default. */
async function confirmTrivial(
  command: SwarmRunCommand,
  gate: { ask: (question: Parameters<SwarmRunCommandGate['ask']>[0]) => Promise<string> },
): Promise<boolean> {
  if (command.trivial === true) return true;
  if (command.trivial === false) return false;
  if (!process.stdin.isTTY) return false;
  const answer = await gate.ask(trivialConfirmQuestion());
  return answerConfirmsTrivial(answer);
}

/** Minimal gate shape used for the trivial confirm. */
interface SwarmRunCommandGate {
  ask(question: ReturnType<typeof trivialConfirmQuestion>): Promise<string>;
}

/** Print one human-readable run summary line per section. */
function printSummary(
  status: string,
  run: {
    readonly id: string;
    readonly phase: string;
    readonly plan?: { readonly tasks: readonly unknown[] };
    readonly implementation?: readonly { readonly filesChanged: readonly string[] }[];
    readonly review?: { readonly status: string };
    readonly verification?: { readonly status: string };
    readonly qualityPasses: number;
  },
  error?: string,
): void {
  console.log(`Swarm run ${run.id}: ${status}`);
  console.log(`  phase: ${run.phase} · quality passes: ${String(run.qualityPasses)}`);
  if (run.plan !== undefined) console.log(`  plan tasks: ${String(run.plan.tasks.length)}`);
  if (run.implementation !== undefined) {
    const files = [...new Set(run.implementation.flatMap((entry) => entry.filesChanged))];
    console.log(`  files changed: ${files.length > 0 ? files.join(', ') : '-'}`);
  }
  if (run.review !== undefined) console.log(`  review: ${run.review.status}`);
  if (run.verification !== undefined) console.log(`  verification: ${run.verification.status}`);
  if (error !== undefined) console.log(`  error: ${error}`);
}

/**
 * Run the swarm pipeline end to end. Returns the terminal status so the CLI
 * can set the exit code. A failed run is a normal outcome, never a throw,
 * except for local input errors such as an unreadable settled file.
 */
export async function runSwarmCommand(
  command: SwarmRunCommand,
  deps: { readonly runner?: CommandRunner } = {},
): Promise<'completed' | 'failed'> {
  const runtime = createSwarmRuntime({
    harness: command.harness,
    dir: command.dir,
    model: command.model,
    timeoutMs: command.timeoutS === undefined ? undefined : command.timeoutS * 1000,
    maxQualityPasses: command.maxPasses,
    allowWrite: command.allowWrite,
    runner: deps.runner,
  });
  const userConfirmedTrivial = await confirmTrivial(command, runtime.gate);
  const triage: TriageAnswers = {
    estimatedLines: command.lines ?? 0,
    fileCount: command.files ?? 1,
    addsDependency: command.addsDependency ?? false,
    hasDesignDecision: command.designDecision ?? false,
    userConfirmedTrivial,
  };
  const settledUnderstanding = await resolveSettled(command);
  const result = await runtime.orchestrator.run({
    request: command.request,
    harness: command.harness,
    triage,
    ...(settledUnderstanding === undefined ? {} : { settledUnderstanding }),
  });
  if (result.status === 'completed') {
    printSummary('completed', result.run);
    return 'completed';
  }
  printSummary('failed', result.run, result.error);
  return 'failed';
}
