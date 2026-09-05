import { getAgentDefinition } from './catalog.ts';
import { parseFindings } from './findings.ts';
import type { ModelProvider } from './model.ts';
import type {
  AgentId,
  Finding,
  Implementation,
  Plan,
  PlanTask,
} from './types.ts';
import { hasBlockingFindings } from './types.ts';

/** Role input and output contract shared by the in-memory orchestrator. */
export interface PipelineAgent<I, O> {
  readonly id: AgentId;
  run(input: I): Promise<O>;
}

export interface PlannerInput {
  readonly request: string;
}

export interface ImplementerInput {
  readonly task: PlanTask;
  readonly plan: string;
}

export interface QualityInput {
  readonly implementation: Implementation;
  readonly plan: string;
}

export interface FixerInput {
  readonly implementation: Implementation;
  readonly findings: readonly Finding[];
}

/** Build the planner role. */
export function createPlanner(
  model: ModelProvider,
): PipelineAgent<PlannerInput, Plan> {
  return {
    id: 'sw-planner',
    async run(input) {
      requireText(input.request, 'planner needs a request');
      const value = await model.generate<unknown>({
        agent: 'sw-planner',
        input,
        schema:
          '{ summary: string, tasks: [{ id: string, title: string }], verification: string[] }',
      });
      return parsePlan(value);
    },
  };
}

/** Build the implementation role. */
export function createImplementer(
  model: ModelProvider,
): PipelineAgent<ImplementerInput, Implementation> {
  return {
    id: 'sw-implementer',
    async run(input) {
      requireText(input.task.id, 'implementer needs a task id');
      const value = await model.generate<unknown>({
        agent: 'sw-implementer',
        input,
        schema: '{ filesChanged: string[], summary: string }',
      });
      const record = recordOf(
        value,
        'implementer returned a non-object response',
      );
      if (
        !Array.isArray(record.filesChanged) ||
        !record.filesChanged.every(isText)
      ) {
        throw new Error('implementer returned malformed filesChanged');
      }
      if (!isText(record.summary))
        throw new Error('implementer returned no summary');
      return {
        taskId: input.task.id,
        filesChanged: record.filesChanged,
        summary: record.summary,
      };
    },
  };
}

/** Build the read-only standards reviewer. */
export function createReviewer(
  model: ModelProvider,
): PipelineAgent<QualityInput, readonly Finding[]> {
  return {
    id: 'sw-code-reviewer',
    async run(input) {
      const value = await model.generate<unknown>({
        agent: 'sw-code-reviewer',
        input,
        schema:
          'a JSON string containing FINDING lines, or the JSON string "No findings"',
      });
      if (!isText(value))
        throw new Error('reviewer returned a non-string response');
      return parseFindings(value, 'reviewer');
    },
  };
}

/** Build the read-only verifier. */
export function createVerifier(
  model: ModelProvider,
): PipelineAgent<QualityInput, readonly Finding[]> {
  return {
    id: 'sw-verifier',
    async run(input) {
      const value = await model.generate<unknown>({
        agent: 'sw-verifier',
        input,
        schema: '{ findings: string, summary: string }',
      });
      const record = recordOf(value, 'verifier output must be an object');
      const findings = findingReport(record.findings, 'verifier');
      requireText(
        record.summary,
        'verifier output.summary must be non-empty text',
      );
      return findings;
    },
  };
}

/** Build the fixer, which is called only when a blocking finding remains. */
export function createFixer(
  model: ModelProvider,
): PipelineAgent<FixerInput, string> {
  return {
    id: 'sw-fixer',
    async run(input) {
      if (!hasBlockingFindings(input.findings))
        return 'No blocking findings to fix.';
      const value = await model.generate<unknown>({
        agent: 'sw-fixer',
        input,
        schema: '{ summary: string }',
      });
      const record = recordOf(value, 'fixer returned a non-object response');
      if (!isText(record.summary)) throw new Error('fixer returned no summary');
      return record.summary;
    },
  };
}

/** Return the exact role instructions for a lightweight embedding API. */
export function roleInstructions(id: AgentId): string {
  return getAgentDefinition(id).instructions;
}

function parsePlan(value: unknown): Plan {
  const record = recordOf(value, 'planner returned a non-object response');
  if (!isText(record.summary)) throw new Error('planner returned no summary');
  if (!Array.isArray(record.tasks) || !record.tasks.every(isPlanTask)) {
    throw new Error('planner returned malformed tasks');
  }
  if (
    !Array.isArray(record.verification) ||
    !record.verification.every(isText)
  ) {
    throw new Error('planner returned malformed verification commands');
  }
  if (record.tasks.length === 0) throw new Error('planner returned no tasks');
  return {
    summary: record.summary,
    tasks: record.tasks,
    verification: record.verification,
  };
}

function isPlanTask(value: unknown): value is PlanTask {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isText(record.id) &&
    isText(record.title) &&
    (record.description === undefined || isText(record.description)) &&
    (record.files === undefined ||
      (Array.isArray(record.files) && record.files.every(isText))) &&
    (record.acceptance === undefined ||
      (Array.isArray(record.acceptance) && record.acceptance.every(isText)))
  );
}

function recordOf(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(message);
  return value as Record<string, unknown>;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireText(value: unknown, message: string): void {
  if (!isText(value)) throw new Error(message);
}

function findingReport(value: unknown, stage: string): readonly Finding[] {
  if (!isText(value)) {
    throw new Error(`${stage} output.findings must be non-empty text`);
  }
  return parseFindings(value, stage);
}
