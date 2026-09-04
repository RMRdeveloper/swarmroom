/** Builds the single prompt each harness CLI receives for one agent step. */
import type { ModelRequest } from '../model.ts';

/** Instructions plus JSON context plus an explicit JSON-only contract. */
export function buildAgentPrompt(request: ModelRequest): string {
  const sections = [
    request.instructions,
    '',
    'Context (JSON):',
    JSON.stringify(request.input),
    '',
    'Respond with ONLY a single JSON value (object, array, or string) matching:',
    request.schemaHint ?? 'any JSON value',
    'No prose before or after the JSON.',
  ];
  return sections.join('\n');
}
