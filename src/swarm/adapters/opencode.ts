/**
 * opencode-backed ModelProvider.
 *
 * Each agent step spawns `opencode run --format json` in the target directory.
 * The full agent instructions travel inside the prompt, so installed agent
 * files are never required: `.md` sources stay documentation-only and the
 * TypeScript orchestrator remains the only router.
 */
import type { ModelProvider, ModelRequest } from '../model.ts';

import { extractJson } from './json.ts';
import type { CommandRunner } from './process.ts';
import { buildAgentPrompt } from './prompt.ts';

/** Options for the opencode provider. */
export interface OpencodeProviderOptions {
  /** Target project directory; the subagent works here. */
  readonly dir: string;
  /** Model override in provider/model format. Defaults to harness configuration. */
  readonly model?: string;
  /** Per-call timeout. Defaults to 10 minutes for agentic tool loops. */
  readonly timeoutMs?: number;
  /** Auto-approve unset permissions. Dangerous; required for file writes. */
  readonly autoApprove?: boolean;
  /** Subprocess seam. Defaults to the node runner. */
  readonly runner?: CommandRunner;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Assistant text parts from `opencode run --format json` event lines. */
export function collectOpencodeText(output: string): string {
  const texts: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (typeof event !== 'object' || event === null) continue;
    const part = (event as { part?: unknown }).part;
    if (typeof part !== 'object' || part === null) continue;
    const record = part as { type?: unknown; text?: unknown };
    if (record.type === 'text' && typeof record.text === 'string') texts.push(record.text);
  }
  return texts.join('');
}

/** Build a provider that executes one opencode run per agent step. */
export function createOpencodeModelProvider(options: OpencodeProviderOptions): ModelProvider {
  if (options.dir.trim().length === 0) throw new Error('opencode provider needs a target dir');
  return {
    async generate<T>(request: ModelRequest): Promise<T> {
      if (options.runner === undefined) throw new Error('opencode provider needs a runner');
      const args: string[] = ['run', '--format', 'json', '--dir', options.dir];
      if (options.model !== undefined) args.push('-m', options.model);
      if (options.autoApprove === true) args.push('--auto');
      args.push(buildAgentPrompt(request));
      const result = await options.runner.run({
        command: 'opencode',
        args,
        cwd: options.dir,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      const text = collectOpencodeText(result.stdout);
      return extractJson(text.length > 0 ? text : result.stdout) as T;
    },
  };
}
