/**
 * Verifier agent. Read-only skeptic: confirms the implementation exists, is
 * wired in, passes tests, and covers edge cases. Edits nothing.
 */
import { validateFindings } from '../../shared/kernel/findings-validator.ts';
import type { ModelProvider } from '../model.ts';
import { hasBlockingFindings } from '../types.ts';
import type { AgentId, Finding, ImplementerResult, VerificationResult } from '../types.ts';

export const VERIFIER_ID: AgentId = 'sw-verifier';

/** Semantic instructions only. No routing, no flow rules. */
export const VERIFIER_INSTRUCTIONS = [
  'You are a skeptical validator.',
  'Confirm the implementation exists, is actually wired in, passes tests,',
  'and covers edge cases. Do not accept claims at face value.',
  'Run the tests and lint yourself and report findings, or `No findings`.',
].join('\n');

/** Input the verifier needs. */
export interface VerifierInput {
  readonly implementation: ImplementerResult;
  readonly planContext: string;
}

/** Minimal agent shape: identity, semantic instructions, structured run. */
export interface VerifierAgent {
  readonly id: AgentId;
  readonly instructions: string;
  run(input: VerifierInput): Promise<VerificationResult>;
}

/**
 * Validate raw model output with the deterministic findings validator.
 * Throws on malformed lines instead of interpreting prose.
 */
export function toVerificationResult(raw: string, summary: string): VerificationResult {
  const validation = validateFindings(raw);
  if (!validation.valid) {
    throw new Error(`verifier returned malformed findings: ${validation.errors.join('; ')}`);
  }
  const findings: readonly Finding[] = validation.findings;
  if (!hasBlockingFindings(findings)) return { status: 'passed', findings };
  return { status: 'failed', findings, summary };
}

/** Build a verifier with explicit dependencies. */
export function createVerifierAgent(options: { readonly model: ModelProvider }): VerifierAgent {
  return {
    id: VERIFIER_ID,
    instructions: VERIFIER_INSTRUCTIONS,
    async run(input: VerifierInput): Promise<VerificationResult> {
      if (input.implementation.taskId.trim().length === 0) {
        throw new Error('verifier needs an implementation to verify');
      }
      const raw = await options.model.generate<unknown>({
        instructions: VERIFIER_INSTRUCTIONS,
        input,
        schemaHint: '{ findings: FINDING lines or `No findings`, summary: string }',
      });
      if (typeof raw !== 'object' || raw === null) {
        throw new Error('verifier returned a non-object result');
      }
      const record = raw as { findings: unknown; summary: unknown };
      if (typeof record.findings !== 'string') {
        throw new TypeError('verifier result is missing findings text');
      }
      if (typeof record.summary !== 'string') {
        throw new TypeError('verifier result is missing a summary');
      }
      return toVerificationResult(record.findings, record.summary);
    },
  };
}
