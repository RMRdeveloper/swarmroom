import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

import type { Scope, Target } from '../domain/targets.ts';
import { targets } from '../domain/targets.ts';

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');

/** Package version from package.json; fail fast if missing. */
export function packageVersion(): string {
  const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error(`missing version in ${pkgPath}`);
  }
  return raw.version;
}

export interface Options {
  readonly chosen: readonly Target[];
  readonly scope: Scope;
  readonly dir: string;
  readonly force: boolean;
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly explicit: boolean;
}

export type ParseResult =
  | { readonly kind: 'ok'; readonly options: Options }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'error'; readonly message: string };

const HELP_HINT = 'Run with --help for usage.';

function editorFlagLine(): string {
  return targets.map((t) => `--${t.id}`).join(' | ');
}

/** Branded usage text for --help / -h. */
export function formatHelp(): string {
  const version = packageVersion();
  const rows: readonly (readonly [string, string])[] = [
    [editorFlagLine(), 'install for those editors (default: all)'],
    ['--global', 'install into the home directory (default: this project)'],
    ['--dir <path>', 'install into another project root'],
    ['--force', 'overwrite existing files without asking'],
    ['-v, --verbose', 'list each installed file'],
    ['-q, --quiet', 'suppress per-target summaries (opening/closing still print)'],
    ['-h, --help', 'show this help'],
    ['-V, --version', 'print version'],
  ];
  const width = Math.max(...rows.map(([flag]) => flag.length));
  const options = rows.map(([flag, desc]) => `  ${flag.padEnd(width)}  ${desc}`).join('\n');

  return `swarmroom — install the sw-* pipeline agents into your editor. v${version}

Usage:
  swarmroom [options]

Also:
  node src/cli.ts [options]
  npm run setup

Options:
${options}

--verbose and --quiet cannot be used together.

With no editor flags in a TTY, prompts interactively. Re-run to update installed files.`;
}

/** Parse argv (without node/script). Validates unknown flags and --dir value. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const picked: Target[] = [];
  let scope: Scope = 'project';
  let dir = cwd();
  let force = false;
  let verbose = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;

    const match = targets.find((t) => a === `--${t.id}`);
    if (match) {
      picked.push(match);
      continue;
    }

    if (a === '--global') {
      scope = 'global';
      continue;
    }

    if (a === '--dir') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--dir requires a path\n${HELP_HINT}` };
      }
      dir = next;
      i += 1;
      continue;
    }

    if (a === '--force') {
      force = true;
      continue;
    }

    if (a === '--verbose' || a === '-v') {
      verbose = true;
      continue;
    }

    if (a === '--quiet' || a === '-q') {
      quiet = true;
      continue;
    }

    if (a === '--help' || a === '-h') {
      return { kind: 'help' };
    }

    if (a === '--version' || a === '-V') {
      return { kind: 'version' };
    }

    return { kind: 'error', message: `unknown option: ${a}\n${HELP_HINT}` };
  }

  if (verbose && quiet) {
    return {
      kind: 'error',
      message: `--verbose and --quiet cannot be used together\n${HELP_HINT}`,
    };
  }

  return {
    kind: 'ok',
    options: {
      chosen: picked.length ? picked : targets,
      scope,
      dir,
      force,
      verbose,
      quiet,
      explicit: picked.length > 0,
    },
  };
}
