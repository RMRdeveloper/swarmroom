import type { AgentId } from './types.ts';

/** A package-owned skill that can add policy to exactly one role request. */
export type PipelineSkill = 'sw-grilling';

/** Small port between the pipeline and a coding-agent runtime. */
export interface ModelProvider {
  generate<T>(request: ModelRequest): Promise<T>;
}

/** A structured request sent to exactly one role. */
export interface ModelRequest {
  readonly agent: AgentId;
  readonly input: unknown;
  readonly schema: string;
  /** Optional package-owned policy to add for this one request. */
  readonly skill?: PipelineSkill;
}
