/**
 * Single-step pipeline core. The orchestrator stays the only router, but each
 * agent step is now addressable: `nextAction` is pure routing, `advanceRun`
 * executes exactly one agent invocation, and `run()` loops until terminal.
 */
import type { FixerAgent } from './agents/fixer.ts';
import { FIXER_ID } from './agents/fixer.ts';
import type { ImplementerAgent } from './agents/implementer.ts';
import { IMPLEMENTER_ID } from './agents/implementer.ts';
import type { PlannerAgent } from './agents/planner.ts';
import { PLANNER_ID } from './agents/planner.ts';
import type { ReviewerAgent } from './agents/reviewer.ts';
import { REVIEWER_ID } from './agents/reviewer.ts';
import type { VerifierAgent } from './agents/verifier.ts';
import { VERIFIER_ID } from './agents/verifier.ts';
import { hasBlockingFindings, isTrivial } from './types.ts';
import type {
  AgentId,
  Finding,
  Harness,
  ImplementerResult,
  PlannerResult,
  PlanTask,
  ReviewResult,
  RunPhase,
  RunStatus,
  TriageAnswers,
  VerificationResult,
} from './types.ts';

/** Persisted run state for session-driven execution. One file per run. */
export interface PersistedRun {
  readonly id: string;
  readonly request: string;
  readonly harness: Harness;
  readonly dir: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxQualityPasses: number;
  readonly triage: TriageAnswers;
  readonly settledUnderstanding?: string;
  readonly phase: RunPhase;
  readonly currentAgent?: AgentId;
  readonly plan?: PlannerResult;
  readonly implementation: readonly ImplementerResult[];
  readonly review?: ReviewResult;
  readonly verification?: VerificationResult;
  readonly qualityPasses: number;
  readonly status: RunStatus;
  readonly error?: string;
  readonly nextTaskIndex: number;
  readonly verifyAgain: boolean;
  readonly pass: number;
  readonly qualityEnabled: boolean;
}

/**
 * Pure routing decision. Terminal evaluation matches the orchestrator
 * messages exactly. Trivial runs (`qualityEnabled=false`) never review.
 */
export type NextAction =
  'plan' | `implement ${string}` | 'review' | 'verify' | 'fix' | 'done' | `failed:${string}`;

/** Explicit agent dependencies for one step. No registries. */
export interface StepAgents {
  readonly planner: PlannerAgent;
  readonly implementer: ImplementerAgent;
  readonly reviewer: ReviewerAgent;
  readonly verifier: VerifierAgent;
  readonly fixer: FixerAgent;
}

/** Options for creating a fresh persisted run. */
export interface CreatePersistedRunOptions {
  readonly id: string;
  readonly request: string;
  readonly harness: Harness;
  readonly dir: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxQualityPasses: number;
  readonly triage: TriageAnswers;
  readonly settledUnderstanding?: string;
}

const COMBINED_IMPLEMENTATION_TASK_ID = 'all';
const TRIVIAL_IMPLEMENTATION_TASK_ID = 'T1';
const GRILLING_GATE_MESSAGE =
  'grilling gate: non-trivial requests need a settled understanding — run grilling in the main conversation first';

/** Review scope is the whole change: one combined subject for quality agents. */
function combineImplementations(implementations: readonly ImplementerResult[]): ImplementerResult {
  const files = [...new Set(implementations.flatMap((entry) => entry.filesChanged))];
  const result = implementations.map((entry) => `${entry.taskId}: ${entry.result}`).join('\n');
  return { taskId: COMBINED_IMPLEMENTATION_TASK_ID, filesChanged: files, result };
}

/** Blocking findings across reviewer and verifier outputs. */
function collectBlocking(
  review: ReviewResult,
  verification: VerificationResult,
): readonly Finding[] {
  const blocking: Finding[] = [];
  if (review.status === 'changes_requested') {
    blocking.push(...review.findings.filter((finding) => finding.severity !== 'Low'));
  }
  if (verification.status === 'failed') {
    blocking.push(...verification.findings.filter((finding) => finding.severity !== 'Low'));
  }
  return blocking;
}

/** One-line summary of open findings for terminal errors. */
function describeOpen(findings: readonly Finding[]): string {
  return findings
    .map((finding) => `${finding.severity} ${finding.fileLine} ${finding.rule}`)
    .join('; ');
}

/** True for terminal routing decisions. */
function isTerminalAction(action: NextAction): boolean {
  return action === 'done' || action.startsWith('failed:');
}

/** Build a fresh running persisted run. Fails fast on a bad pass cap. */
export function createPersistedRun(options: CreatePersistedRunOptions): PersistedRun {
  const { maxQualityPasses } = options;
  if (
    !Number.isFinite(maxQualityPasses) ||
    !Number.isInteger(maxQualityPasses) ||
    maxQualityPasses < 1
  ) {
    throw new Error('maxQualityPasses must be a finite integer of at least 1');
  }
  return {
    id: options.id,
    request: options.request,
    harness: options.harness,
    dir: options.dir,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    maxQualityPasses,
    triage: options.triage,
    ...(options.settledUnderstanding === undefined
      ? {}
      : { settledUnderstanding: options.settledUnderstanding }),
    phase: 'triage',
    implementation: [],
    qualityPasses: 0,
    status: 'running',
    nextTaskIndex: 0,
    verifyAgain: true,
    pass: 0,
    qualityEnabled: !isTrivial(options.triage),
  };
}

/** Pure routing for one persisted run. Throws at the grilling gate. */
export function nextAction(run: PersistedRun): NextAction {
  if (run.status === 'completed') return 'done';
  if (run.status === 'failed') return `failed:${run.error ?? 'unknown error'}`;
  if (run.qualityEnabled) {
    const settled = run.settledUnderstanding?.trim() ?? '';
    if (settled.length === 0) throw new Error(GRILLING_GATE_MESSAGE);
  }
  if (!run.qualityEnabled) {
    if (run.implementation.length === 0) return `implement ${TRIVIAL_IMPLEMENTATION_TASK_ID}`;
    if (run.verification === undefined) return 'verify';
    if (run.verification.status === 'failed') {
      return `failed:verification failed: ${run.verification.summary}`;
    }
    return 'done';
  }
  if (run.plan === undefined) return 'plan';
  const task = run.plan.tasks[run.nextTaskIndex];
  if (task !== undefined) return `implement ${task.id}`;
  if (run.review === undefined) return 'review';
  if (run.verifyAgain && run.verification === undefined) return 'verify';
  const verification: VerificationResult = run.verification ?? { status: 'passed', findings: [] };
  const blocking = collectBlocking(run.review, verification);
  if (!hasBlockingFindings(blocking)) return 'done';
  if (run.pass + 1 >= run.maxQualityPasses) {
    if (verification.status === 'failed') {
      return `failed:verification failed: ${verification.summary}`;
    }
    return `failed:review still requests changes: ${describeOpen(blocking)}`;
  }
  return 'fix';
}

/**
 * Execute exactly one agent invocation for the current `nextAction`, then
 * re-derive. Terminal actions transition status without an agent call.
 * Agent failures become a failed run. The grilling gate throws.
 */
export async function advanceRun(run: PersistedRun, agents: StepAgents): Promise<PersistedRun> {
  if (run.status !== 'running') return run;
  if (run.qualityEnabled) {
    const settled = run.settledUnderstanding?.trim() ?? '';
    if (settled.length === 0) throw new Error(GRILLING_GATE_MESSAGE);
  }
  const action = nextAction(run);
  if (isTerminalAction(action)) {
    if (action === 'done') return { ...run, phase: 'done', status: 'completed' };
    const reason = action.slice('failed:'.length);
    return { ...run, phase: 'done', status: 'failed', error: reason };
  }
  if (action === 'plan') {
    try {
      const settled = run.settledUnderstanding?.trim() ?? '';
      const plan = await agents.planner.run({
        request: run.request,
        settledUnderstanding: settled,
      });
      return { ...run, phase: 'planning', currentAgent: PLANNER_ID, plan, nextTaskIndex: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ...run, phase: 'done', currentAgent: PLANNER_ID, status: 'failed', error: message };
    }
  }
  if (action.startsWith('implement ')) {
    let task: PlanTask;
    let planContext: string;
    if (run.qualityEnabled) {
      const planned = run.plan?.tasks[run.nextTaskIndex];
      if (planned === undefined) throw new Error('implement step needs a planned task');
      task = planned;
      planContext = run.plan?.plan ?? run.request;
    } else {
      task = { id: TRIVIAL_IMPLEMENTATION_TASK_ID, title: run.request };
      planContext = run.request;
    }
    try {
      const result = await agents.implementer.run({ task, planContext });
      return {
        ...run,
        phase: 'implementing',
        currentAgent: IMPLEMENTER_ID,
        implementation: [...run.implementation, result],
        nextTaskIndex: run.nextTaskIndex + 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...run,
        phase: 'done',
        currentAgent: IMPLEMENTER_ID,
        status: 'failed',
        error: message,
      };
    }
  }
  if (action === 'review') {
    const subject = combineImplementations(run.implementation);
    const planContext = run.plan?.plan ?? run.request;
    try {
      const review = await agents.reviewer.run({ implementation: subject, planContext });
      return { ...run, phase: 'reviewing', currentAgent: REVIEWER_ID, review };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...run,
        phase: 'done',
        currentAgent: REVIEWER_ID,
        status: 'failed',
        error: message,
      };
    }
  }
  if (action === 'verify') {
    const planContext = run.plan?.plan ?? run.request;
    if (!run.qualityEnabled) {
      const single = run.implementation[0];
      if (single === undefined) throw new Error('verify step needs an implementation');
      try {
        const verification = await agents.verifier.run({
          implementation: single,
          planContext,
        });
        return { ...run, phase: 'verifying', currentAgent: VERIFIER_ID, verification };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ...run,
          phase: 'done',
          currentAgent: VERIFIER_ID,
          status: 'failed',
          error: message,
        };
      }
    }
    const subject = combineImplementations(run.implementation);
    try {
      const verification = await agents.verifier.run({ implementation: subject, planContext });
      return { ...run, phase: 'reviewing', currentAgent: VERIFIER_ID, verification };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...run,
        phase: 'done',
        currentAgent: VERIFIER_ID,
        status: 'failed',
        error: message,
      };
    }
  }
  const review = run.review;
  if (review === undefined) throw new Error('fix step needs a review');
  const currentVerification: VerificationResult = run.verification ?? {
    status: 'passed',
    findings: [],
  };
  const blocking = collectBlocking(review, currentVerification);
  const subject = combineImplementations(run.implementation);
  try {
    await agents.fixer.run({ findings: blocking, implementation: subject });
    const nextVerifyAgain =
      currentVerification.status === 'failed' && hasBlockingFindings(currentVerification.findings);
    return {
      ...run,
      phase: 'fixing',
      currentAgent: FIXER_ID,
      qualityPasses: run.qualityPasses + 1,
      pass: run.pass + 1,
      verifyAgain: nextVerifyAgain,
      review: undefined,
      verification: undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...run, phase: 'done', currentAgent: FIXER_ID, status: 'failed', error: message };
  }
}
