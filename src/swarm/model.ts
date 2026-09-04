/**
 * Minimal model boundary.
 *
 * The orchestrated runtime never calls a concrete LLM API. Each agent receives
 * a `ModelProvider` and asks it for structured output; the harness session
 * (opencode primary agent, pi session) implements `generate` by invoking the
 * model and returning parsed data. Tests use a fake. No multi-provider
 * framework: one interface, explicit dependencies.
 */
export interface ModelRequest {
  /** Semantic instructions for the model. Never contains routing or flow rules. */
  readonly instructions: string;
  /** Structured input the model must work from. */
  readonly input: unknown;
  /** Short schema hint so the model returns parseable data. */
  readonly schemaHint?: string;
}

/** Single-method boundary between agents and whatever produces model output. */
export interface ModelProvider {
  generate<T>(request: ModelRequest): Promise<T>;
}
