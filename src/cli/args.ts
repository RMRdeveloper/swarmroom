import { targets } from '../shared/kernel/install-targets.ts';
import { packageVersion as cachedPackageVersion } from '../shared/kernel/package-root.ts';
import type { ParseResult } from '../shared/kernel/tasks-cli-types.ts';

import { parseInstallArgs, parseValidateFindingsArgs } from './args.install.ts';
import { parseTasksArgs } from './args.tasks.ts';

export type {
  Options,
  ParseResult,
  TasksCommand,
  TaskStatus,
} from '../shared/kernel/tasks-cli-types.ts';

/** Package version from package.json; fail fast if missing. */
export function packageVersion(): string {
  return cachedPackageVersion();
}

/** Build editor flag line for help output. */
function editorFlagLine(): string {
  return targets.map((target) => `--${target.id}`).join(' | ');
}

/** Render help text with installed version. */
export function formatHelp(): string {
  const version = packageVersion();
  const rows: readonly (readonly [string, string])[] = [
    [editorFlagLine(), 'install for those editors (default: all)'],
    ['--global', 'install into the home directory (default: this project)'],
    ['--dir <path>', 'install into another project root'],
    ['--force', 'overwrite existing files without asking'],
    ['--dry-run', 'show what would be installed without writing files'],
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

/** Parse argv (without node/script). Validates unknown flags and --dir value. */
export function parseArgs(argv: readonly string[]): ParseResult {
  if (argv[0] === 'tasks') {
    return parseTasksArgs(argv.slice(1));
  }
  if (argv[0] === 'validate-findings') {
    return parseValidateFindingsArgs(argv.slice(1));
  }
  return parseInstallArgs(argv);
}
