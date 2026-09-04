/**
 * pi-backed ModelProvider.
 *
 * Each agent step spawns `pi -p --mode json --no-session` in the target
 * directory. The full agent instructions travel inside the prompt, so the
 * `.md` sources stay documentation-only and the TypeScript orchestrator
 * remains the only router.
 */
import type { ModelProvider, ModelRequest } from '../model.ts';

import { extractJson } from './json.ts';
import type { CommandRunner } from './process.ts';
import { buildAgentPrompt } from './prompt.ts';

/** Options for the pi provider. */
export interface PiProviderOptions {
  /** Target project directory; the subagent works here. */
  readonly dir: string;
  /** Model override in provider/id format. Defaults to harness configuration. */
  readonly model?: string;
  /** Per-call timeout. Defaults to 10 minutes for agentic tool loops. */
  readonly timeoutMs?: number;
  /** Trust project-local files for this run (needed for file writes). */
  readonly approveProjectFiles?: boolean;
  /** Subprocess seam. Defaults to the node runner. */
  readonly runner?: CommandRunner;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Assistant text delta from one pi --mode json event line. */
function deltaFromLine(line: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (typeof event !== 'object' || event === null) return null;
  const update = (event as { assistantMessageEvent?: unknown }).assistantMessageEvent;
  if (typeof update !== 'object' || update === null) return null;
  const record = update as { type?: unknown; delta?: unknown };
  if (record.type === 'text_delta' && typeof record.delta === 'string') return record.delta;
  return null;
}

/** Final assistant message text from one pi --mode json event line. */
function finalTextFromLine(line: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (typeof event !== 'object' || event === null) return null;
  const message = (event as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const record = message as { role?: unknown; content?: unknown };
  if (record.role !== 'assistant' || !Array.isArray(record.content)) return null;
  const texts: string[] = [];
  for (const block of record.content) {
    if (typeof block !== 'object' || block === null) continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === 'string') texts.push(text);
  }
  return texts.length > 0 ? texts.join('') : null;
}

/** Assistant text from pi --mode json output. Prefers deltas, falls back to final messages. */
export function collectPiText(output: string): string {
  let deltas = '';
  let lastFinal = '';
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const delta = deltaFromLine(trimmed);
    if (delta !== null) deltas += delta;
    const final = finalTextFromLine(trimmed);
    if (final !== null) lastFinal = final;
  }
  return deltas.length > 0 ? deltas : lastFinal;
}

/** Build a provider that executes one pi run per agent step. */
export function createPiModelProvider(options: PiProviderOptions): ModelProvider {
  if (options.dir.trim().length === 0) throw new Error('pi provider needs a target dir');
  return {
    async generate<T>(request: ModelRequest): Promise<T> {
      if (options.runner === undefined) throw new Error('pi provider needs a runner');
      const args: string[] = ['-p', '--no-session', '--mode', 'json'];
      if (options.model !== undefined) args.push('--model', options.model);
      if (options.approveProjectFiles === true) args.push('-a');
      args.push('--', buildAgentPrompt(request));
      const result = await options.runner.run({
        command: 'pi',
        args,
        cwd: options.dir,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      const text = collectPiText(result.stdout);
      return extractJson(text.length > 0 ? text : result.stdout) as T;
    },
  };
}
