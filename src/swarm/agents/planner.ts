/**
 * Planner agent. Produces a plan plus a compact task list. Writes no code and
 * decides nothing about what runs next.
 */
import type { ModelProvider } from '../model.ts';
import type { AgentId, PlannerResult, PlanTask } from '../types.ts';

export const PLANNER_ID: AgentId = 'sw-planner';

/** Semantic instructions only. No routing, no flow rules. */
export const PLANNER_INSTRUCTIONS = [
  'You are a senior planning engineer.',
  'Analyze the requested change and the settled understanding provided.',
  'Return a concrete ordered implementation plan following the required schema:',
  'a prose plan, a task list with ids and acceptance hints, and the exact',
  'commands that verify the work.',
  'Do not write code. Output only the plan.',
].join('\n');

/** Input the planner needs. The settled understanding comes from the grilling gate. */
export interface PlannerInput {
  readonly request: string;
  readonly settledUnderstanding?: string;
}

/** Minimal agent shape: identity, semantic instructions, structured run. */
export interface PlannerAgent {
  readonly id: AgentId;
  readonly instructions: string;
  run(input: PlannerInput): Promise<PlannerResult>;
}

function isPlanTask(value: unknown): value is PlanTask {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.title === 'string' &&
    record.title.trim().length > 0 &&
    (!Object.hasOwn(record, 'description') || typeof record.description === 'string') &&
    (!Object.hasOwn(record, 'agent') || typeof record.agent === 'string') &&
    (!Object.hasOwn(record, 'files') ||
      (Array.isArray(record.files) && record.files.every((entry) => typeof entry === 'string'))) &&
    (!Object.hasOwn(record, 'acceptance') ||
      (Array.isArray(record.acceptance) &&
        record.acceptance.every((entry) => typeof entry === 'string')))
  );
}

/** Fail fast on malformed model output instead of guessing. */
function assertPlannerResult(value: unknown): PlannerResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('planner returned a non-object result');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.plan !== 'string' || record.plan.length === 0) {
    throw new Error('planner result is missing a non-empty plan');
  }
  if (!Array.isArray(record.tasks) || !record.tasks.every(isPlanTask)) {
    throw new Error('planner result has malformed tasks');
  }
  if (
    !Array.isArray(record.verification) ||
    !record.verification.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('planner result has malformed verification commands');
  }
  return value as PlannerResult;
}

/** Build a planner with explicit dependencies. */
export function createPlannerAgent(options: { readonly model: ModelProvider }): PlannerAgent {
  return {
    id: PLANNER_ID,
    instructions: PLANNER_INSTRUCTIONS,
    async run(input: PlannerInput): Promise<PlannerResult> {
      if (input.request.trim().length === 0) throw new Error('planner needs a non-empty request');
      const raw = await options.model.generate<unknown>({
        instructions: PLANNER_INSTRUCTIONS,
        input,
        schemaHint: '{ plan: string, tasks: [{ id, title }], verification: string[] }',
      });
      return assertPlannerResult(raw);
    },
  };
}
