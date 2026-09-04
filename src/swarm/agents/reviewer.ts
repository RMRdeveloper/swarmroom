/**
 * Code reviewer agent. Read-only: reviews the implementation against the repo
 * coding standards and returns structured findings. Edits nothing.
 */
import { validateFindings } from '../../shared/kernel/findings-validator.ts';
import type { ModelProvider } from '../model.ts';
import { hasBlockingFindings } from '../types.ts';
import type { AgentId, Finding, ImplementerResult, ReviewResult } from '../types.ts';

export const REVIEWER_ID: AgentId = 'sw-code-reviewer';

/** Semantic instructions only. No routing, no flow rules. */
export const REVIEWER_INSTRUCTIONS = [
  'You are a strict standards reviewer.',
  'Review the given implementation against the repository coding standards.',
  'Cite each violation with file:line and the violated rule.',
  'Do not flag style preferences that are not backed by a rule.',
  'Do not edit code. Output only findings, or `No findings` when clean.',
].join('\n');

/** Input the reviewer needs. */
export interface ReviewerInput {
  readonly implementation: ImplementerResult;
  readonly planContext: string;
}

/** Minimal agent shape: identity, semantic instructions, structured run. */
export interface ReviewerAgent {
  readonly id: AgentId;
  readonly instructions: string;
  run(input: ReviewerInput): Promise<ReviewResult>;
}

/**
 * Validate raw model output with the deterministic findings validator.
 * Throws on malformed lines instead of interpreting prose.
 */
export function toReviewResult(raw: string): ReviewResult {
  const validation = validateFindings(raw);
  if (!validation.valid) {
    throw new Error(`reviewer returned malformed findings: ${validation.errors.join('; ')}`);
  }
  const findings: readonly Finding[] = validation.findings;
  if (!hasBlockingFindings(findings)) return { status: 'approved', findings };
  const feedback = findings
    .filter((finding) => finding.severity !== 'Low')
    .map((finding) => `${finding.fileLine} ${finding.rule}: ${finding.description}`)
    .join('\n');
  return { status: 'changes_requested', findings, feedback };
}

/** Build a reviewer with explicit dependencies. */
export function createReviewerAgent(options: { readonly model: ModelProvider }): ReviewerAgent {
  return {
    id: REVIEWER_ID,
    instructions: REVIEWER_INSTRUCTIONS,
    async run(input: ReviewerInput): Promise<ReviewResult> {
      if (input.implementation.taskId.trim().length === 0) {
        throw new Error('reviewer needs an implementation to review');
      }
      const raw = await options.model.generate<string>({
        instructions: REVIEWER_INSTRUCTIONS,
        input,
        schemaHint: 'FINDING N | Severity | file:line | rule | description, or `No findings`',
      });
      if (typeof raw !== 'string') throw new Error('reviewer returned a non-string result');
      return toReviewResult(raw);
    },
  };
}
