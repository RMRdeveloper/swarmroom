/** Minimal shared types for the orchestrated swarm runtime. */

import type { ParsedFinding } from '../shared/kernel/findings-validator.ts';

/** Agents that form the pipeline. Mirrors `agents` in `shared/kernel/pipeline.ts`. */
export type AgentId =
  'sw-planner' | 'sw-implementer' | 'sw-code-reviewer' | 'sw-verifier' | 'sw-fixer';

/** Harnesses the orchestrated runtime supports. Nothing else. */
export type Harness = 'opencode' | 'pi';

/** Lifecycle of a single swarm run. */
export type RunStatus = 'running' | 'completed' | 'failed';

/** Observable phase of the run. Written by the orchestrator, never by agents. */
export type RunPhase =
  'triage' | 'planning' | 'implementing' | 'reviewing' | 'fixing' | 'verifying' | 'done';

/**
 * Answers for the trivial triage gate.
 * Trivial iff ALL hold: <=20 lines, exactly 1 file, no new dep/import,
 * no design decision, and the user confirms `trivial` via the harness
 * question tool. When in doubt the caller must ask, never assume.
 */
export interface TriageAnswers {
  readonly estimatedLines: number;
  readonly fileCount: number;
  readonly addsDependency: boolean;
  readonly hasDesignDecision: boolean;
  readonly userConfirmedTrivial: boolean;
}

/** True only when every trivial condition holds. */
export function isTrivial(answers: TriageAnswers): boolean {
  if (answers.estimatedLines > 20) return false;
  if (answers.fileCount !== 1) return false;
  if (answers.addsDependency) return false;
  if (answers.hasDesignDecision) return false;
  return answers.userConfirmedTrivial;
}

/** Single planned task. Minimal execution subset of the `.tasks` block format. */
export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly agent?: string;
  readonly files?: readonly string[];
  readonly acceptance?: readonly string[];
}

/** Structured planner output. */
export interface PlannerResult {
  readonly plan: string;
  readonly tasks: readonly PlanTask[];
  readonly verification: readonly string[];
}

/** Input for one implementation step. */
export interface ImplementerInput {
  readonly task: PlanTask;
  readonly planContext: string;
  readonly feedback?: string;
}

/** Structured implementer output. */
export interface ImplementerResult {
  readonly taskId: string;
  readonly filesChanged: readonly string[];
  readonly result: string;
}

/** A validated finding. Reuses the kernel's parsed shape. */
export type Finding = ParsedFinding;

/** Severities that block the pipeline. `Low` is informative only. */
export const BLOCKING_SEVERITIES: ReadonlySet<Finding['severity']> = new Set([
  'Critical',
  'High',
  'Medium',
]);

/** True when at least one finding blocks the pipeline. */
export function hasBlockingFindings(findings: readonly Finding[]): boolean {
  return findings.some((finding) => BLOCKING_SEVERITIES.has(finding.severity));
}

/** Structured reviewer output. The status is data, never prose to interpret. */
export type ReviewResult =
  | { readonly status: 'approved'; readonly findings: readonly Finding[] }
  | {
      readonly status: 'changes_requested';
      readonly findings: readonly Finding[];
      readonly feedback: string;
    };

/** Structured verifier output. */
export type VerificationResult =
  | { readonly status: 'passed'; readonly findings: readonly Finding[] }
  | {
      readonly status: 'failed';
      readonly findings: readonly Finding[];
      readonly summary: string;
    };

/** Input for one fixer pass. */
export interface FixerInput {
  readonly findings: readonly Finding[];
  readonly implementation: ImplementerResult;
}

/** Structured fixer output. */
export interface FixerResult {
  readonly fixed: readonly string[];
  readonly open: readonly Finding[];
  readonly result: string;
}

/** Entry input for a swarm run. */
export interface RunInput {
  readonly request: string;
  readonly harness: Harness;
  readonly triage: TriageAnswers;
  /** Settled understanding from the grilling gate. Required for non-trivial runs. */
  readonly settledUnderstanding?: string;
}

/** Minimal execution state. No memory, no history, no embeddings. */
export interface SwarmRun {
  readonly id: string;
  readonly input: string;
  readonly harness: Harness;
  readonly phase: RunPhase;
  readonly currentAgent?: AgentId;
  readonly plan?: PlannerResult;
  readonly implementation?: readonly ImplementerResult[];
  readonly review?: ReviewResult;
  readonly verification?: VerificationResult;
  readonly qualityPasses: number;
  readonly status: RunStatus;
  readonly error?: string;
}

/** Terminal output of a swarm run. */
export type RunResult =
  | { readonly status: 'completed'; readonly run: SwarmRun }
  | { readonly status: 'failed'; readonly run: SwarmRun; readonly error: string };
