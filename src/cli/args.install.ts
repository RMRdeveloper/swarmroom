import { cwd } from 'node:process';

import { targets, type Scope, type Target } from '../shared/kernel/install-targets.ts';
import type { ParseResult } from '../shared/kernel/tasks-cli-types.ts';

const HELP_HINT = 'Run with --help for usage.';

/** Parse validate-findings arguments. */
export function parseValidateFindingsArgs(argv: readonly string[]): ParseResult {
  let file: string | undefined;
  let strict = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') {
      if (file !== undefined) {
        return { kind: 'error', message: `ambiguous repeated flag: --file\n${HELP_HINT}` };
      }
      const next = argv[index + 1];
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
      index += 1;
      continue;
    }
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };
    return {
      kind: 'error',
      message: `unknown option for validate-findings: ${String(arg)}\n${HELP_HINT}`,
    };
  }
  if (file === undefined) {
    return { kind: 'error', message: `validate-findings requires --file <path>\n${HELP_HINT}` };
  }
  return { kind: 'validate-findings', file, strict };
}

/** Parse install (default) arguments. */
export function parseInstallArgs(argv: readonly string[]): ParseResult {
  const picked: Target[] = [];
  let scope: Scope = 'project';
  let dir = cwd();
  let force = false;
  let verbose = false;
  let quiet = false;
  let dryRun = false;
  let pi = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    const match = targets.find((target) => arg === `--${target.id}`);
    if (match) {
      picked.push(match);
      continue;
    }

    if (arg === '--global') {
      scope = 'global';
      continue;
    }

    if (arg === '--dir') {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--dir requires a path\n${HELP_HINT}` };
      }
      dir = next;
      index += 1;
      continue;
    }

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--pi') {
      pi = true;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      quiet = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { kind: 'help' };
    }

    if (arg === '--version' || arg === '-V') {
      return { kind: 'version' };
    }

    return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
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
      chosen: picked.length > 0 ? picked : pi ? [] : targets,
      scope,
      dir,
      force,
      verbose,
      quiet,
      explicit: picked.length > 0 || pi,
      dryRun,
      pi,
    },
  };
}
