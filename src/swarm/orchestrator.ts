/**
 * SwarmOrchestrator: the single place that decides which agent runs and when.
 *
 * Thin loop over the single-step core in `steps.ts`. Routing, terminal
 * messages, and the grilling gate live there; this class preserves the
 * historical `run()` shape so existing callers and tests keep working.
 */
import type { FixerAgent } from './agents/fixer.ts';
import type { ImplementerAgent } from './agents/implementer.ts';
import type { PlannerAgent } from './agents/planner.ts';
import type { ReviewerAgent } from './agents/reviewer.ts';
import type { VerifierAgent } from './agents/verifier.ts';
import { newRunId as defaultNewRunId } from './run-store.ts';
import { advanceRun, createPersistedRun } from './steps.ts';
import type { PersistedRun } from './steps.ts';
import type { RunInput, RunResult, SwarmRun } from './types.ts';

/** Explicit dependencies. No registries, no plugin architecture. */
export interface SwarmOrchestratorOptions {
  readonly planner: PlannerAgent;
  readonly implementer: ImplementerAgent;
  readonly reviewer: ReviewerAgent;
  readonly verifier: VerifierAgent;
  readonly fixer: FixerAgent;
  /** Quality passes before giving up. Defaults to 2, mirroring the fixer cap. */
  readonly maxQualityPasses?: number;
  /** Id factory for runs. Defaults to a timestamped slug. */
  readonly newRunId?: () => string;
}

const DEFAULT_MAX_QUALITY_PASSES = 2;

/** Convert persisted step state to its terminal `SwarmRun` representation. */
function toSwarmRun(run: PersistedRun): SwarmRun {
  return {
    id: run.id,
    input: run.request,
    harness: run.harness,
    phase: run.phase,
    ...(run.currentAgent === undefined ? {} : { currentAgent: run.currentAgent }),
    ...(run.plan === undefined ? {} : { plan: run.plan }),
    ...(run.implementation.length === 0 ? {} : { implementation: [...run.implementation] }),
    ...(run.review === undefined ? {} : { review: run.review }),
    ...(run.verification === undefined ? {} : { verification: run.verification }),
    qualityPasses: run.qualityPasses,
    status: run.status === 'running' ? 'failed' : run.status,
    ...(run.error === undefined ? {} : { error: run.error }),
  };
}

export class SwarmOrchestrator {
  private readonly planner: PlannerAgent;
  private readonly implementer: ImplementerAgent;
  private readonly reviewer: ReviewerAgent;
  private readonly verifier: VerifierAgent;
  private readonly fixer: FixerAgent;
  private readonly maxQualityPasses: number;
  private readonly newRunId: () => string;

  constructor(options: SwarmOrchestratorOptions) {
    const { maxQualityPasses = DEFAULT_MAX_QUALITY_PASSES } = options;
    if (
      !Number.isFinite(maxQualityPasses) ||
      !Number.isInteger(maxQualityPasses) ||
      maxQualityPasses < 1
    ) {
      throw new Error('maxQualityPasses must be a finite integer of at least 1');
    }

    this.planner = options.planner;
    this.implementer = options.implementer;
    this.reviewer = options.reviewer;
    this.verifier = options.verifier;
    this.fixer = options.fixer;
    this.maxQualityPasses = maxQualityPasses;
    this.newRunId = options.newRunId ?? defaultNewRunId;
  }

  /** Run the pipeline end to end. Agent/model failures become a failed run, never a throw. */
  async run(input: RunInput): Promise<RunResult> {
    let persisted: PersistedRun = createPersistedRun({
      id: this.newRunId(),
      request: input.request,
      harness: input.harness,
      dir: '',
      maxQualityPasses: this.maxQualityPasses,
      triage: input.triage,
      ...(input.settledUnderstanding === undefined
        ? {}
        : { settledUnderstanding: input.settledUnderstanding }),
    });
    const agents = {
      planner: this.planner,
      implementer: this.implementer,
      reviewer: this.reviewer,
      verifier: this.verifier,
      fixer: this.fixer,
    };
    try {
      while (persisted.status === 'running') {
        persisted = await advanceRun(persisted, agents);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persisted = { ...persisted, phase: 'done', status: 'failed', error: message };
    }
    const run = toSwarmRun(persisted);
    if (run.status === 'failed')
      return { status: 'failed', run, error: run.error ?? 'unknown error' };
    return { status: 'completed', run };
  }
}
