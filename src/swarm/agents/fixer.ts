/**
 * Fixer agent. Fixes reported findings in place, severity-first, touching only
 * code referenced by the report. Decides nothing about re-review: the
 * orchestrator owns the quality loop and its pass cap.
 */
import type { ModelProvider } from '../model.ts';
import type { AgentId, FixerInput, FixerResult, Finding } from '../types.ts';

export const FIXER_ID: AgentId = 'sw-fixer';

/** Semantic instructions only. No routing, no flow rules. */
export const FIXER_INSTRUCTIONS = [
  'You are a senior engineer fixing findings.',
  'Fix findings in severity order: Critical, then High, then Medium.',
  'Touch only code referenced by the report; fix the root cause, not the symptom.',
  'After each fix run the repository test and lint commands.',
  'Report what changed per finding and which findings remain open.',
].join('\n');

/** Minimal agent shape: identity, semantic instructions, structured run. */
export interface FixerAgent {
  readonly id: AgentId;
  readonly instructions: string;
  run(input: FixerInput): Promise<FixerResult>;
}

/** Open findings are those the fixer did not close. */
export function openFindings(input: readonly Finding[], fixed: readonly string[]): Finding[] {
  const closed = new Set(fixed);
  return input.filter((finding) => !closed.has(`${String(finding.n)}:${finding.fileLine}`));
}

/** Build a fixer with explicit dependencies. */
export function createFixerAgent(options: { readonly model: ModelProvider }): FixerAgent {
  return {
    id: FIXER_ID,
    instructions: FIXER_INSTRUCTIONS,
    async run(input: FixerInput): Promise<FixerResult> {
      if (input.findings.length === 0) throw new Error('fixer needs at least one finding');
      const raw = await options.model.generate<unknown>({
        instructions: FIXER_INSTRUCTIONS,
        input,
        schemaHint: '{ fixed: string[], result: string }',
      });
      if (typeof raw !== 'object' || raw === null) {
        throw new Error('fixer returned a non-object result');
      }
      const record = raw as Record<string, unknown>;
      if (!Array.isArray(record.fixed) || !record.fixed.every((e) => typeof e === 'string')) {
        throw new Error('fixer result has malformed fixed list');
      }
      if (typeof record.result !== 'string') {
        throw new TypeError('fixer result is missing a result summary');
      }
      const fixed = record.fixed as readonly string[];
      return { fixed, open: openFindings(input.findings, fixed), result: record.result };
    },
  };
}
