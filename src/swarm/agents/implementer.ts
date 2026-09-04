/**
 * Implementer agent. Implements one planned task. Runs the repo checks before
 * finishing and reports a structured result. Never touches the task graph.
 */
import type { ModelProvider } from '../model.ts';
import type { AgentId, ImplementerInput, ImplementerResult } from '../types.ts';

export const IMPLEMENTER_ID: AgentId = 'sw-implementer';

/** Semantic instructions only. No routing, no flow rules. */
export const IMPLEMENTER_INSTRUCTIONS = [
  'You are a senior engineer implementing changes.',
  'Implement only the given task scope and respect the repository coding standards.',
  'Run the repository test and lint commands before finishing and fix any',
  'failure you introduced.',
  'Report the files changed and the result. Never mutate any task graph.',
].join('\n');

/** Minimal agent shape: identity, semantic instructions, structured run. */
export interface ImplementerAgent {
  readonly id: AgentId;
  readonly instructions: string;
  run(input: ImplementerInput): Promise<ImplementerResult>;
}

/** Fail fast on malformed model output instead of guessing. */
function assertImplementerResult(value: unknown, taskId: string): ImplementerResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('implementer returned a non-object result');
  }
  const record = value as Record<string, unknown>;
  const filesChanged = record.filesChanged;
  if (!Array.isArray(filesChanged) || !filesChanged.every((entry) => typeof entry === 'string')) {
    throw new Error('implementer result has malformed filesChanged');
  }
  if (typeof record.result !== 'string') {
    throw new TypeError('implementer result is missing a result summary');
  }
  return { taskId, filesChanged, result: record.result };
}

/** Build an implementer with explicit dependencies. */
export function createImplementerAgent(options: {
  readonly model: ModelProvider;
}): ImplementerAgent {
  return {
    id: IMPLEMENTER_ID,
    instructions: IMPLEMENTER_INSTRUCTIONS,
    async run(input: ImplementerInput): Promise<ImplementerResult> {
      if (input.task.id.trim().length === 0) throw new Error('implementer needs a task id');
      const raw = await options.model.generate<unknown>({
        instructions: IMPLEMENTER_INSTRUCTIONS,
        input,
        schemaHint: '{ filesChanged: string[], result: string }',
      });
      return assertImplementerResult(raw, input.task.id);
    },
  };
}
