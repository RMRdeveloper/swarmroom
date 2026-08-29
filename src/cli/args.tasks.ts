import { cwd } from 'node:process';

import {
  isTaskStatus,
  type ParseResult,
  type TasksCommand,
} from '../shared/kernel/tasks-cli-types.ts';
import { assertTasksFileSafe } from '../shared/kernel/tasks-format.ts';

const HELP_HINT = 'Run with --help for usage.';

/** Parse tasks subcommand arguments. */
export function parseTasksArgs(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let tasksFile: string | undefined;
  let tasksFileSeen = false;
  const command: TasksCommand = { kind: 'status' };
  let dirSeen = false;
  let result: string | undefined;
  let error: string | undefined;
  let file: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };

    if (arg === '--tasks-file') {
      if (tasksFileSeen)
        return { kind: 'error', message: `ambiguous repeated flag: --tasks-file\n${HELP_HINT}` };
      tasksFileSeen = true;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--tasks-file requires a path\n${HELP_HINT}` };
      }
      if (next.length === 0)
        return { kind: 'error', message: `--tasks-file requires a non-empty path\n${HELP_HINT}` };
      try {
        assertTasksFileSafe(next);
      } catch {
        return { kind: 'error', message: `--tasks-file must not contain \`..\`\n${HELP_HINT}` };
      }
      tasksFile = next;
      index += 1;
      continue;
    }

    if (arg === '--dir') {
      if (dirSeen)
        return { kind: 'error', message: `ambiguous repeated flag: --dir\n${HELP_HINT}` };
      dirSeen = true;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `--dir requires a path\n${HELP_HINT}` };
      }
      dir = next;
      index += 1;
      continue;
    }

    if (['--result', '--error', '--file'].includes(arg)) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        return { kind: 'error', message: `${arg} requires a value\n${HELP_HINT}` };
      }
      if (arg === '--result') {
        if (result !== undefined)
          return { kind: 'error', message: `ambiguous repeated flag: --result\n${HELP_HINT}` };
        result = next;
      } else if (arg === '--error') {
        if (error !== undefined)
          return { kind: 'error', message: `ambiguous repeated flag: --error\n${HELP_HINT}` };
        error = next;
      } else {
        if (file !== undefined)
          return { kind: 'error', message: `ambiguous repeated flag: --file\n${HELP_HINT}` };
        file = next;
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--'))
      return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
    positionals.push(arg);
  }

  const [name, id, status, ...extra] = positionals;
  if (tasksFile === undefined) {
    return { kind: 'error', message: `tasks requires --tasks-file <path>\n${HELP_HINT}` };
  }
  if (name === undefined) {
    if (result !== undefined || error !== undefined || file !== undefined) {
      return { kind: 'error', message: `task flags require a subcommand\n${HELP_HINT}` };
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
      return { kind: 'error', message: `tasks status takes no arguments\n${HELP_HINT}` };
    return { kind: 'tasks', command: { kind: 'status' }, dir, tasksFile };
  }
  if (name === 'set') {
    if (id === undefined || status === undefined || extra.length > 0) {
      return { kind: 'error', message: `tasks set requires <id> <status>\n${HELP_HINT}` };
    }
    if (!isTaskStatus(status))
      return { kind: 'error', message: `invalid task status: ${status}\n${HELP_HINT}` };
    if (file !== undefined)
      return { kind: 'error', message: `--file is only valid with tasks replan\n${HELP_HINT}` };
    if (result !== undefined && error !== undefined) {
      return {
        kind: 'error',
        message: `--result and --error cannot be used together\n${HELP_HINT}`,
      };
    }
    if (result !== undefined && status !== 'completed')
      return { kind: 'error', message: `--result requires status completed\n${HELP_HINT}` };
    if (error !== undefined && status !== 'failed')
      return { kind: 'error', message: `--error requires status failed\n${HELP_HINT}` };
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
      return { kind: 'error', message: `tasks replan accepts only --file <path>\n${HELP_HINT}` };
    if (file === undefined)
      return { kind: 'error', message: `tasks replan requires --file <path>\n${HELP_HINT}` };
    return { kind: 'tasks', command: { kind: 'replan', file }, dir, tasksFile };
  }
  return { kind: 'error', message: `unknown tasks command: ${name}\n${HELP_HINT}` };
}
