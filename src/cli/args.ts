import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';

import type { Scope, Target } from '../features/installer/targets.ts';
import { targets } from '../features/installer/targets.ts';
import { isTaskStatus, type TaskStatus } from '../features/tasks/tasks.ts';
import { packageRoot } from '../shared/kernel/package-root.ts';

const pkgPath = path.join(packageRoot(), 'package.json');

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
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'tasks';
      readonly command: TasksCommand;
      readonly dir: string;
      readonly tasksFile: string;
    }
  | {
      readonly kind: 'validate-findings';
      readonly file: string;
      readonly strict: boolean;
    };

export type TasksCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'validate' }
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'set';
      readonly id: string;
      readonly status: TaskStatus;
      readonly result?: string;
      readonly error?: string;
    }
  | { readonly kind: 'replan'; readonly file: string };

const HELP_HINT = 'Run with --help for usage.';

function editorFlagLine(): string {
  return targets.map((t) => `--${t.id}`).join(' | ');
}

export function formatHelp(): string {
  const version = packageVersion();
  const rows: readonly (readonly [string, string])[] = [
    [editorFlagLine(), 'install for those editors (default: all)'],
    ['--global', 'install into the home directory (default: this project)'],
    ['--dir <path>', 'install into another project root'],
    ['--force', 'overwrite existing files without asking'],
    ['-v, --verbose', 'list each installed file'],
    ['-q, --quiet', 'suppress per-target summaries (opening/closing still print)'],
    ['tasks [command]', 'inspect or mutate the task graph'],
    ['--tasks-file <path>', 'task graph file under .swarmroom/tasks/ (required for tasks)'],
    ['validate-findings --file <path> [--strict]', 'validate FINDING lines (deterministic)'],
    ['-h, --help', 'show this help'],
    ['-V, --version', 'print version'],
  ];
  const width = Math.max(...rows.map(([flag]) => flag.length));
  const options = rows.map(([flag, desc]) => `  ${flag.padEnd(width)}  ${desc}`).join('\n');

  return `swarmroom — install the sw-* pipeline agents into your editor. v${version}

Usage:
  swarmroom [options]
  swarmroom tasks --tasks-file <path> [validate|ready|set <id> <status>|replan --file <path>] [--dir <path>]
  npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <path> [validate|ready|set <id> <status>|replan --file <path>] [--dir <path>]
  swarmroom validate-findings --file <path> [--strict]

Also:
  node src/cli.ts [options]
  npm run setup

Note: in clean checkouts without a global/local install, use npx --yes @rmrdeveloper/swarmroom (bare swarmroom is ephemeral via npx; npx swarmroom without scope resolves to a different package).

Options:
${options}

--verbose and --quiet cannot be used together.

With no editor flags in a TTY, prompts interactively. Re-run to update installed files.`;
}

function parseTasksArgs(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let tasksFile: string | undefined;
  let tasksFileSeen = false;
  const command: TasksCommand = { kind: 'status' };
  let dirSeen = false;
  let result: string | undefined;
  let error: string | undefined;
  let file: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === '--help' || a === '-h') return { kind: 'help' };
    if (a === '--version' || a === '-V') return { kind: 'version' };

    if (a === '--tasks-file') {
      if (tasksFileSeen)
        return { kind: 'error', message: 'ambiguous repeated flag: --tasks-file\n' + HELP_HINT };
      tasksFileSeen = true;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--tasks-file requires a path\n${HELP_HINT}` };
      }
      if (next.length === 0)
        return { kind: 'error', message: `--tasks-file requires a non-empty path\n${HELP_HINT}` };
      if (next.includes('..'))
        return { kind: 'error', message: `--tasks-file must not contain \`..\`\n${HELP_HINT}` };
      tasksFile = next;
      i += 1;
      continue;
    }

    if (a === '--dir') {
      if (dirSeen)
        return { kind: 'error', message: 'ambiguous repeated flag: --dir\n' + HELP_HINT };
      dirSeen = true;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--dir requires a path\n${HELP_HINT}` };
      }
      dir = next;
      i += 1;
      continue;
    }

    if (['--result', '--error', '--file'].includes(a)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `${a} requires a value\n${HELP_HINT}` };
      }
      if (a === '--result') {
        if (result !== undefined)
          return { kind: 'error', message: 'ambiguous repeated flag: --result\n' + HELP_HINT };
        result = next;
      } else if (a === '--error') {
        if (error !== undefined)
          return { kind: 'error', message: 'ambiguous repeated flag: --error\n' + HELP_HINT };
        error = next;
      } else {
        if (file !== undefined)
          return { kind: 'error', message: 'ambiguous repeated flag: --file\n' + HELP_HINT };
        file = next;
      }
      i += 1;
      continue;
    }

    if (a.startsWith('--')) return { kind: 'error', message: `unknown option: ${a}\n${HELP_HINT}` };
    positionals.push(a);
  }

  const [name, id, status, ...extra] = positionals;
  if (tasksFile === undefined) {
    return { kind: 'error', message: `tasks requires --tasks-file <path>\n${HELP_HINT}` };
  }
  if (name === undefined) {
    if (result !== undefined || error !== undefined || file !== undefined) {
      return { kind: 'error', message: 'task flags require a subcommand\n' + HELP_HINT };
    }
    return { kind: 'tasks', command, dir, tasksFile };
  }
  if (name === 'validate' || name === 'ready') {
    if (
      id !== undefined ||
      extra.length > 0 ||
      result !== undefined ||
      error !== undefined ||
      file !== undefined
    )
      return { kind: 'error', message: `tasks ${name} takes no arguments\n${HELP_HINT}` };
    return { kind: 'tasks', command: { kind: name }, dir, tasksFile };
  }
  if (name === 'status') {
    if (
      id !== undefined ||
      extra.length > 0 ||
      result !== undefined ||
      error !== undefined ||
      file !== undefined
    )
      return { kind: 'error', message: 'tasks status takes no arguments\n' + HELP_HINT };
    return { kind: 'tasks', command: { kind: 'status' }, dir, tasksFile };
  }
  if (name === 'set') {
    if (id === undefined || status === undefined || extra.length > 0) {
      return { kind: 'error', message: 'tasks set requires <id> <status>\n' + HELP_HINT };
    }
    if (!isTaskStatus(status))
      return { kind: 'error', message: `invalid task status: ${status}\n${HELP_HINT}` };
    if (file !== undefined)
      return { kind: 'error', message: '--file is only valid with tasks replan\n' + HELP_HINT };
    if (result !== undefined && error !== undefined)
      return {
        kind: 'error',
        message: '--result and --error cannot be used together\n' + HELP_HINT,
      };
    if (result !== undefined && status !== 'completed')
      return { kind: 'error', message: '--result requires status completed\n' + HELP_HINT };
    if (error !== undefined && status !== 'failed')
      return { kind: 'error', message: '--error requires status failed\n' + HELP_HINT };
    return {
      kind: 'tasks',
      command: {
        kind: 'set',
        id,
        status,
        ...(result === undefined ? {} : { result }),
        ...(error === undefined ? {} : { error }),
      },
      dir,
      tasksFile,
    };
  }
  if (name === 'replan') {
    if (id !== undefined || extra.length > 0 || result !== undefined || error !== undefined)
      return { kind: 'error', message: 'tasks replan accepts only --file <path>\n' + HELP_HINT };
    if (file === undefined)
      return { kind: 'error', message: 'tasks replan requires --file <path>\n' + HELP_HINT };
    return { kind: 'tasks', command: { kind: 'replan', file }, dir, tasksFile };
  }
  return { kind: 'error', message: `unknown tasks command: ${name}\n${HELP_HINT}` };
}

function parseValidateFindingsArgs(argv: readonly string[]): ParseResult {
  let file: string | undefined;
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') {
      if (file !== undefined) {
        return { kind: 'error', message: `ambiguous repeated flag: --file\n${HELP_HINT}` };
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--file requires a path\n${HELP_HINT}` };
      }
      if (next.length === 0) {
        return { kind: 'error', message: `--file requires a non-empty path\n${HELP_HINT}` };
      }
      if (next.includes('..')) {
        return { kind: 'error', message: `--file must not contain \`..\`\n${HELP_HINT}` };
      }
      file = next;
      i += 1;
      continue;
    }
    if (a === '--strict') {
      strict = true;
      continue;
    }
    if (a === '--help' || a === '-h') return { kind: 'help' };
    if (a === '--version' || a === '-V') return { kind: 'version' };
    return {
      kind: 'error',
      message: `unknown option for validate-findings: ${String(a)}\n${HELP_HINT}`,
    };
  }
  if (file === undefined) {
    return { kind: 'error', message: `validate-findings requires --file <path>\n${HELP_HINT}` };
  }
  return { kind: 'validate-findings', file, strict };
}

/** Parse argv (without node/script). Validates unknown flags and --dir value. */
export function parseArgs(argv: readonly string[]): ParseResult {
  if (argv[0] === 'tasks') {
    return parseTasksArgs(argv.slice(1));
  }
  if (argv[0] === 'validate-findings') {
    return parseValidateFindingsArgs(argv.slice(1));
  }

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
      chosen: picked.length > 0 ? picked : targets,
      scope,
      dir,
      force,
      verbose,
      quiet,
      explicit: picked.length > 0,
    },
  };
}
