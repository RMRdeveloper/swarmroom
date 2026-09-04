/**
 * Pi extension: `/sw-pipeline`.
 *
 * In-chat launcher. It resolves the session-driver skill and injects one
 * message into the current Pi session. All routing lives in the TypeScript
 * step core; this file never decides which agent runs next and never spawns.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Minimal structural pi surface used here. */
export interface PipelineApi {
  registerCommand(
    name: string,
    options: {
      readonly description?: string;
      handler: (args: string, ctx: PipelineCommandContext) => Promise<void>;
    },
  ): void;
  sendUserMessage(text: string): Promise<void>;
}

/** Minimal structural command context used here. */
export interface PipelineCommandContext {
  readonly cwd: string;
}

/** Parsed `/sw-pipeline` arguments. */
export interface PipelineArgs {
  readonly request: string;
  readonly model?: string;
}

/** Usage text shown on empty or malformed input. */
export const PIPELINE_USAGE = '/sw-pipeline [--model <id>] <request>';

/** Split raw command args into tokens. Quoting is not supported. */
function tokenize(raw: string): string[] {
  return raw.split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Parse `/sw-pipeline` args. Throws with usage on empty request, missing
 * option values, or unknown flags.
 */
export function parsePipelineArgs(raw: string): PipelineArgs {
  const tokens = tokenize(raw);
  let model: string | undefined;
  const requestTokens: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--model') {
      const next = tokens[index + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`--model requires a value. Usage: ${PIPELINE_USAGE}`);
      }
      model = next;
      index += 1;
      continue;
    }
    if (token?.startsWith('--') === true) {
      throw new Error(`unknown option: ${token}. Usage: ${PIPELINE_USAGE}`);
    }
    if (token !== undefined) requestTokens.push(token);
  }
  const request = requestTokens.join(' ');
  if (request.length === 0) throw new Error(`missing request. Usage: ${PIPELINE_USAGE}`);
  return { request, ...(model === undefined ? {} : { model }) };
}

/**
 * Resolve the skill path from the extension module URL. Prefers the installed
 * `.pi/skills` copy (what the installer guarantees next to this extension),
 * then the source checkout layouts. Throws when no candidate exists.
 */
export function resolveSkillPath(fileUrl: string, exists: (path: string) => boolean): string {
  const extDir = dirname(fileURLToPath(fileUrl));
  const candidates = [
    join(extDir, '..', 'skills', 'sw-pipeline', 'SKILL.md'),
    join(extDir, '..', '..', 'src', 'assets', 'skills', 'sw-pipeline', 'SKILL.md'),
    join(extDir, '..', '..', '..', 'src', 'assets', 'skills', 'sw-pipeline', 'SKILL.md'),
  ];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(`sw-pipeline skill not found. Tried: ${candidates.join(', ')}`);
}

/** Build the in-chat launcher message for one request. */
export function buildPipelineMessage(options: {
  readonly skillPath: string;
  readonly cwd: string;
  readonly request: string;
  readonly model?: string;
}): string {
  const harness = options.model === undefined ? 'pi' : `pi --model ${options.model}`;
  return `Follow the sw-pipeline skill at ${options.skillPath} for this request: ${options.request}. Project dir: ${options.cwd}. Harness: ${harness}.`;
}

/** Create the `/sw-pipeline` handler with injectable seams. */
export function createPipelineHandler(deps: {
  readonly fileUrl: string;
  readonly exists: (path: string) => boolean;
  readonly sendUserMessage: (text: string) => Promise<void>;
}): (args: string, ctx: PipelineCommandContext) => Promise<void> {
  return async (args: string, ctx: PipelineCommandContext): Promise<void> => {
    const parsed = parsePipelineArgs(args);
    const skillPath = resolveSkillPath(deps.fileUrl, deps.exists);
    const text = buildPipelineMessage({
      skillPath,
      cwd: ctx.cwd,
      request: parsed.request,
      ...(parsed.model === undefined ? {} : { model: parsed.model }),
    });
    try {
      await deps.sendUserMessage(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`sw-pipeline is busy: ${message} — retry when idle`);
    }
  };
}

/** Pi entry point: registers `/sw-pipeline`. */
export default function swPipelineExtension(pi: PipelineApi): void {
  pi.registerCommand('sw-pipeline', {
    description: 'Drive the sw-* pipeline conversationally for <request>',
    handler: createPipelineHandler({
      fileUrl: import.meta.url,
      exists: existsSync,
      sendUserMessage: (text: string) => pi.sendUserMessage(text),
    }),
  });
}
