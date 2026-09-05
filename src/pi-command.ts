import type { Language } from './core/types.ts';
import { LANGUAGES } from './core/types.ts';

/** Options accepted by Pi's `/sideroom` extension command. */
export type PiCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'run';
      readonly language: Language;
      readonly request?: string;
      readonly maxFixPasses?: number;
      readonly allowWrite: boolean;
    };

/** Parse a Pi command's raw argument string without involving a shell. */
export function parsePiCommand(args: string): PiCommand {
  const tokenResult = splitArguments(args);
  if (typeof tokenResult === 'string')
    return { kind: 'error', message: tokenResult };

  let language: Language = 'typescript';
  let maxFixPasses: number | undefined;
  let allowWrite = true;
  const requestParts: string[] = [];

  for (let index = 0; index < tokenResult.length; index += 1) {
    const token = tokenResult[index];
    if (token === undefined) continue;
    if (token === '--help' || token === '-h') return { kind: 'help' };
    if (token === '--read-only') {
      allowWrite = false;
      continue;
    }
    if (token === '--language' || token === '--max-fix-passes') {
      const value = tokenResult[index + 1];
      if (value === undefined || value.startsWith('-') || value.length === 0) {
        return { kind: 'error', message: `${token} requires a value` };
      }
      index += 1;
      if (token === '--language') {
        if (!LANGUAGES.includes(value as Language)) {
          return {
            kind: 'error',
            message: `--language must be one of: ${LANGUAGES.join(', ')}`,
          };
        }
        language = value as Language;
      } else {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1) {
          return {
            kind: 'error',
            message: '--max-fix-passes must be an integer of at least 1',
          };
        }
        maxFixPasses = count;
      }
      continue;
    }
    if (token.startsWith('-')) {
      return { kind: 'error', message: `unknown option: ${token}` };
    }
    requestParts.push(token);
  }

  return {
    kind: 'run',
    language,
    ...(requestParts.length === 0 ? {} : { request: requestParts.join(' ') }),
    ...(maxFixPasses === undefined ? {} : { maxFixPasses }),
    allowWrite,
  };
}

/** Help text shown by `/sideroom --help` inside Pi. */
export function formatPiCommandHelp(): string {
  return `Usage: /sideroom [request] [options]

Options:
  --language <name>            typescript | javascript | php-laravel | python | java
  --max-fix-passes <number>    Maximum repair passes (default: 2)
  --read-only                  Do not grant write-capable tools
  -h, --help                   Show this help

Run Pi from the repository you want to change. Sideroom creates no project-local state.`;
}

function splitArguments(source: string): readonly string[] | string {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (const character of source.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === '\\') {
      escaping = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }
  if (escaping) return 'command arguments cannot end with an escape character';
  if (quote !== undefined)
    return 'command arguments contain an unterminated quote';
  if (current.length > 0) tokens.push(current);
  return tokens;
}
