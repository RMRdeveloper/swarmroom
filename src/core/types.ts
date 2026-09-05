/** The five roles scheduled by the coding pipeline. */
export type AgentId =
  | 'sideroom-planner'
  | 'sideroom-implementer'
  | 'sideroom-code-reviewer'
  | 'sideroom-verifier'
  | 'sideroom-fixer';

/** Coding-guideline variants shipped with the package. */
export const LANGUAGES = [
  'typescript',
  'javascript',
  'php-laravel',
  'python',
  'java',
] as const;
export type Language = (typeof LANGUAGES)[number];

/** One implementation unit returned by the planning role. */
export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly files?: readonly string[];
  readonly acceptance?: readonly string[];
}

/** The planner's structured response. */
export interface Plan {
  readonly summary: string;
  readonly tasks: readonly PlanTask[];
  readonly verification: readonly string[];
}

/** What the implementer reports after one task. */
export interface Implementation {
  readonly taskId: string;
  readonly filesChanged: readonly string[];
  readonly summary: string;
}

/** A deterministic finding understood by reviewer, verifier, and fixer. */
export interface Finding {
  readonly number: number;
  readonly severity: 'Critical' | 'High' | 'Medium' | 'Low';
  readonly fileLine: string;
  readonly rule: string;
  readonly description: string;
}

/** A completed or failed in-memory pipeline run. */
export interface PipelineResult {
  readonly status: 'completed' | 'failed';
  readonly plan?: Plan;
  readonly implementations: readonly Implementation[];
  readonly findings: readonly Finding[];
  readonly summary: string;
}

/** Critical, high, and medium findings require a fixer pass. */
export function hasBlockingFindings(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity !== 'Low');
}
