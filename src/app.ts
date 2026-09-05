import {
  createFixer,
  createImplementer,
  createPlanner,
  createReviewer,
  createVerifier,
} from './core/agents.ts';
import { createGriller } from './core/grilling.ts';
import {
  type PipelineObserver,
  SwarmOrchestrator,
} from './core/orchestrator.ts';
import type { Language } from './core/types.ts';
import { createPiModelProvider } from './runtimes/pi.ts';

/** Create the Pi-first pipeline for its Pi extension host. */
export function createPipeline(options: {
  readonly dir: string;
  readonly language: Language;
  readonly model?: string;
  readonly maxFixPasses?: number;
  readonly allowWrite?: boolean;
  readonly onStage?: PipelineObserver;
}): SwarmOrchestrator {
  const model = createPiModelProvider({
    dir: options.dir,
    language: options.language,
    ...(options.model === undefined ? {} : { model: options.model }),
    allowWrite: options.allowWrite,
  });
  return new SwarmOrchestrator({
    planner: createPlanner(model),
    implementer: createImplementer(model),
    reviewer: createReviewer(model),
    verifier: createVerifier(model),
    fixer: createFixer(model),
    griller: createGriller(model),
    maxFixPasses: options.maxFixPasses,
    onStage: options.onStage,
  });
}
