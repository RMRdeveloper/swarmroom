/**
 * Wiring for one harness run. Picks the subprocess-backed ModelProvider for
 * the requested harness, builds the five agents, and returns the orchestrator
 * plus a terminal gate. No other harness exists.
 */
import { createFixerAgent, type FixerAgent } from '../agents/fixer.ts';
import { createImplementerAgent, type ImplementerAgent } from '../agents/implementer.ts';
import { createPlannerAgent, type PlannerAgent } from '../agents/planner.ts';
import { createReviewerAgent, type ReviewerAgent } from '../agents/reviewer.ts';
import { createVerifierAgent, type VerifierAgent } from '../agents/verifier.ts';
import type { UserGate } from '../harness.ts';
import type { ModelProvider } from '../model.ts';
import { SwarmOrchestrator } from '../orchestrator.ts';
import type { Harness } from '../types.ts';

import { createStdinGate } from './gate.ts';
import { createNodeCommandRunner } from './node-runner.ts';
import { createOpencodeModelProvider } from './opencode.ts';
import { createPiModelProvider } from './pi.ts';
import type { CommandRunner } from './process.ts';

/** Options for one harness-wired swarm. */
export interface SwarmRuntimeOptions {
  readonly harness: Harness;
  /** Target project directory where subagents work. */
  readonly dir: string;
  /** Model override forwarded to the harness CLI. */
  readonly model?: string;
  /** Per-agent-call timeout. */
  readonly timeoutMs?: number;
  /** Quality passes before giving up. Defaults to 2, mirroring the fixer cap. */
  readonly maxQualityPasses?: number;
  /** Allow file writes (opencode --auto / pi -a). Off by default. */
  readonly allowWrite?: boolean;
  /** Subprocess seam for tests. Defaults to the node runner. */
  readonly runner?: CommandRunner;
}

/** Wired runtime: orchestrator, agents, provider, and human gate. */
export interface SwarmRuntime {
  readonly orchestrator: SwarmOrchestrator;
  readonly gate: UserGate;
  readonly model: ModelProvider;
  readonly planner: PlannerAgent;
  readonly implementer: ImplementerAgent;
  readonly reviewer: ReviewerAgent;
  readonly verifier: VerifierAgent;
  readonly fixer: FixerAgent;
}

/** Build the full runtime for exactly one of the two supported harnesses. */
export function createSwarmRuntime(options: SwarmRuntimeOptions): SwarmRuntime {
  const runner = options.runner ?? createNodeCommandRunner();
  const model =
    options.harness === 'opencode'
      ? createOpencodeModelProvider({
          dir: options.dir,
          model: options.model,
          timeoutMs: options.timeoutMs,
          autoApprove: options.allowWrite,
          runner,
        })
      : createPiModelProvider({
          dir: options.dir,
          model: options.model,
          timeoutMs: options.timeoutMs,
          approveProjectFiles: options.allowWrite,
          runner,
        });
  return {
    orchestrator: new SwarmOrchestrator({
      maxQualityPasses: options.maxQualityPasses,
      planner: createPlannerAgent({ model }),
      implementer: createImplementerAgent({ model }),
      reviewer: createReviewerAgent({ model }),
      verifier: createVerifierAgent({ model }),
      fixer: createFixerAgent({ model }),
    }),
    gate: createStdinGate(options.harness),
    model,
    planner: createPlannerAgent({ model }),
    implementer: createImplementerAgent({ model }),
    reviewer: createReviewerAgent({ model }),
    verifier: createVerifierAgent({ model }),
    fixer: createFixerAgent({ model }),
  };
}
