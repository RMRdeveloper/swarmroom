/** Parse the swarm subcommand arguments. */
import { cwd } from 'node:process';

import type { ParseResult } from '../shared/kernel/tasks-cli-types.ts';

const HELP_HINT = 'Run with --help for usage.';

/** Parse a non-negative integer flag value. */
function parseCount(flag: string, raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

/** Dispatch to the run, start, step, or status subcommand. */
export function parseSwarmArgs(argv: readonly string[]): ParseResult {
  const sub = argv[0];
  if (sub === undefined) {
    return {
      kind: 'error',
      message: `swarm takes only the run|start|step|status subcommands\n${HELP_HINT}`,
    };
  }
  if (sub === '--help' || sub === '-h') return { kind: 'help' };
  if (sub === '--version' || sub === '-V') return { kind: 'version' };
  if (sub === 'run') return parseRunTail(argv.slice(1));
  if (sub === 'start') return parseStartTail(argv.slice(1));
  if (sub === 'step') return parseStepTail(argv.slice(1));
  if (sub === 'status') return parseStatusTail(argv.slice(1));
  return {
    kind: 'error',
    message: `swarm takes only the run|start|step|status subcommands\n${HELP_HINT}`,
  };
}

/** Parse the swarm run subcommand arguments. */
function parseRunTail(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let harness: 'opencode' | 'pi' | undefined;
  let request: string | undefined;
  let model: string | undefined;
  let trivial: boolean | undefined;
  let lines: number | undefined;
  let files: number | undefined;
  let addsDependency = false;
  let designDecision = false;
  let settledUnderstanding: string | undefined;
  let settledFile: string | undefined;
  let maxPasses: number | undefined;
  let timeoutS: number | undefined;
  let allowWrite = false;
  const seen = new Set<string>();
  const positionals: string[] = [];

  /** Reject repeated single-value flags. */
  function takeValue(flag: string, index: number): string | ParseResult {
    if (seen.has(flag)) {
      return { kind: 'error', message: `ambiguous repeated flag: ${flag}\n${HELP_HINT}` };
    }
    seen.add(flag);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-') || next.length === 0) {
      return { kind: 'error', message: `${flag} requires a value\n${HELP_HINT}` };
    }
    return next;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };

    if (
      arg === '--trivial' ||
      arg === '--non-trivial' ||
      arg === '--adds-dep' ||
      arg === '--allow-write'
    ) {
      if (seen.has(arg)) {
        return { kind: 'error', message: `ambiguous repeated flag: ${arg}\n${HELP_HINT}` };
      }
      if (arg === '--trivial' && seen.has('--non-trivial')) {
        return {
          kind: 'error',
          message: `--trivial and --non-trivial cannot be used together\n${HELP_HINT}`,
        };
      }
      if (arg === '--non-trivial' && seen.has('--trivial')) {
        return {
          kind: 'error',
          message: `--trivial and --non-trivial cannot be used together\n${HELP_HINT}`,
        };
      }
      seen.add(arg);
      switch (arg) {
        case '--trivial': {
          trivial = true;
          break;
        }
        case '--non-trivial': {
          trivial = false;
          break;
        }
        case '--adds-dep': {
          addsDependency = true;
          break;
        }
        default: {
          allowWrite = true;
        }
      }
      continue;
    }

    if (arg === '--design-decision') {
      if (seen.has(arg)) {
        return { kind: 'error', message: `ambiguous repeated flag: ${arg}\n${HELP_HINT}` };
      }
      seen.add(arg);
      designDecision = true;
      continue;
    }

    if (
      arg === '--harness' ||
      arg === '--request' ||
      arg === '--dir' ||
      arg === '--model' ||
      arg === '--settled-understanding' ||
      arg === '--settled-file'
    ) {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      switch (arg) {
        case '--harness': {
          if (taken !== 'opencode' && taken !== 'pi') {
            return { kind: 'error', message: `--harness must be opencode or pi\n${HELP_HINT}` };
          }
          harness = taken;

          break;
        }
        case '--request': {
          request = taken;
          break;
        }
        case '--dir': {
          dir = taken;
          break;
        }
        case '--model': {
          model = taken;
          break;
        }
        case '--settled-understanding': {
          settledUnderstanding = taken;
          break;
        }
        default: {
          settledFile = taken;
        }
      }
      continue;
    }

    if (arg === '--lines' || arg === '--files' || arg === '--max-passes' || arg === '--timeout-s') {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      const parsed = parseCount(arg, taken);
      if (parsed === null) {
        return { kind: 'error', message: `${arg} requires a non-negative integer\n${HELP_HINT}` };
      }
      if ((arg === '--max-passes' || arg === '--timeout-s') && parsed < 1) {
        return { kind: 'error', message: `${arg} requires an integer of at least 1\n${HELP_HINT}` };
      }
      switch (arg) {
        case '--lines': {
          lines = parsed;
          break;
        }
        case '--files': {
          files = parsed;
          break;
        }
        case '--max-passes': {
          maxPasses = parsed;
          break;
        }
        default: {
          timeoutS = parsed;
        }
      }
      continue;
    }

    if (arg.startsWith('--'))
      return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
    positionals.push(arg);
  }

  if (positionals.length > 0) {
    return { kind: 'error', message: `swarm run takes no positional arguments\n${HELP_HINT}` };
  }
  if (harness === undefined) {
    return { kind: 'error', message: `swarm run requires --harness <opencode|pi>\n${HELP_HINT}` };
  }
  if (request === undefined || request.trim().length === 0) {
    return { kind: 'error', message: `swarm run requires --request <text>\n${HELP_HINT}` };
  }
  if (settledUnderstanding !== undefined && settledFile !== undefined) {
    return {
      kind: 'error',
      message: `--settled-understanding and --settled-file cannot be used together\n${HELP_HINT}`,
    };
  }
  return {
    kind: 'swarm-run',
    dir,
    harness,
    request,
    ...(model === undefined ? {} : { model }),
    ...(trivial === undefined ? {} : { trivial }),
    ...(lines === undefined ? {} : { lines }),
    ...(files === undefined ? {} : { files }),
    addsDependency,
    designDecision,
    ...(settledUnderstanding === undefined ? {} : { settledUnderstanding }),
    ...(settledFile === undefined ? {} : { settledFile }),
    ...(maxPasses === undefined ? {} : { maxPasses }),
    ...(timeoutS === undefined ? {} : { timeoutS }),
    allowWrite,
  };
}

/** Parse the swarm start subcommand arguments. */
function parseStartTail(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let harness: 'opencode' | 'pi' | undefined;
  let request: string | undefined;
  let model: string | undefined;
  let trivial: boolean | undefined;
  let lines: number | undefined;
  let files: number | undefined;
  let addsDependency = false;
  let designDecision = false;
  let settledUnderstanding: string | undefined;
  let settledFile: string | undefined;
  let maxPasses: number | undefined;
  let timeoutS: number | undefined;
  const seen = new Set<string>();
  const positionals: string[] = [];

  /** Reject repeated single-value flags. */
  function takeValue(flag: string, index: number): string | ParseResult {
    if (seen.has(flag)) {
      return { kind: 'error', message: `ambiguous repeated flag: ${flag}\n${HELP_HINT}` };
    }
    seen.add(flag);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-') || next.length === 0) {
      return { kind: 'error', message: `${flag} requires a value\n${HELP_HINT}` };
    }
    return next;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };
    if (arg === '--trivial' || arg === '--adds-dep') {
      if (seen.has(arg)) {
        return { kind: 'error', message: `ambiguous repeated flag: ${arg}\n${HELP_HINT}` };
      }
      seen.add(arg);
      if (arg === '--trivial') trivial = true;
      else addsDependency = true;
      continue;
    }
    if (arg === '--design-decision') {
      if (seen.has(arg)) {
        return { kind: 'error', message: `ambiguous repeated flag: ${arg}\n${HELP_HINT}` };
      }
      seen.add(arg);
      designDecision = true;
      continue;
    }
    if (
      arg === '--harness' ||
      arg === '--request' ||
      arg === '--dir' ||
      arg === '--model' ||
      arg === '--settled-understanding' ||
      arg === '--settled-file'
    ) {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      switch (arg) {
        case '--harness': {
          if (taken !== 'opencode' && taken !== 'pi') {
            return { kind: 'error', message: `--harness must be opencode or pi\n${HELP_HINT}` };
          }
          harness = taken;
          break;
        }
        case '--request': {
          request = taken;
          break;
        }
        case '--dir': {
          dir = taken;
          break;
        }
        case '--model': {
          model = taken;
          break;
        }
        case '--settled-understanding': {
          settledUnderstanding = taken;
          break;
        }
        default: {
          settledFile = taken;
        }
      }
      continue;
    }
    if (arg === '--lines' || arg === '--files' || arg === '--max-passes' || arg === '--timeout-s') {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      const parsed = parseCount(arg, taken);
      if (parsed === null) {
        return { kind: 'error', message: `${arg} requires a non-negative integer\n${HELP_HINT}` };
      }
      if ((arg === '--max-passes' || arg === '--timeout-s') && parsed < 1) {
        return { kind: 'error', message: `${arg} requires an integer of at least 1\n${HELP_HINT}` };
      }
      switch (arg) {
        case '--lines': {
          lines = parsed;
          break;
        }
        case '--files': {
          files = parsed;
          break;
        }
        case '--max-passes': {
          maxPasses = parsed;
          break;
        }
        default: {
          timeoutS = parsed;
        }
      }
      continue;
    }
    if (arg.startsWith('--'))
      return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
    positionals.push(arg);
  }

  if (positionals.length > 0) {
    return { kind: 'error', message: `swarm start takes no positional arguments\n${HELP_HINT}` };
  }
  if (harness === undefined) {
    return { kind: 'error', message: `swarm start requires --harness <opencode|pi>\n${HELP_HINT}` };
  }
  if (request === undefined || request.trim().length === 0) {
    return { kind: 'error', message: `swarm start requires --request <text>\n${HELP_HINT}` };
  }
  if (settledUnderstanding !== undefined && settledFile !== undefined) {
    return {
      kind: 'error',
      message: `--settled-understanding and --settled-file cannot be used together\n${HELP_HINT}`,
    };
  }
  return {
    kind: 'swarm-start',
    dir,
    harness,
    request,
    ...(model === undefined ? {} : { model }),
    ...(trivial === undefined ? {} : { trivial }),
    ...(lines === undefined ? {} : { lines }),
    ...(files === undefined ? {} : { files }),
    addsDependency,
    designDecision,
    ...(settledUnderstanding === undefined ? {} : { settledUnderstanding }),
    ...(settledFile === undefined ? {} : { settledFile }),
    ...(maxPasses === undefined ? {} : { maxPasses }),
    ...(timeoutS === undefined ? {} : { timeoutS }),
  };
}

/** Parse the swarm step subcommand arguments. */
function parseStepTail(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let runId: string | undefined;
  let model: string | undefined;
  let timeoutS: number | undefined;
  let allowWrite = false;
  const seen = new Set<string>();
  const positionals: string[] = [];

  /** Reject repeated single-value flags. */
  function takeValue(flag: string, index: number): string | ParseResult {
    if (seen.has(flag)) {
      return { kind: 'error', message: `ambiguous repeated flag: ${flag}\n${HELP_HINT}` };
    }
    seen.add(flag);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-') || next.length === 0) {
      return { kind: 'error', message: `${flag} requires a value\n${HELP_HINT}` };
    }
    return next;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };
    if (arg === '--allow-write') {
      if (seen.has(arg)) {
        return { kind: 'error', message: `ambiguous repeated flag: ${arg}\n${HELP_HINT}` };
      }
      seen.add(arg);
      allowWrite = true;
      continue;
    }
    if (arg === '--run' || arg === '--dir' || arg === '--model' || arg === '--timeout-s') {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      switch (arg) {
        case '--run': {
          runId = taken;
          break;
        }
        case '--dir': {
          dir = taken;
          break;
        }
        case '--model': {
          model = taken;
          break;
        }
        default: {
          const parsed = parseCount(arg, taken);
          if (parsed === null) {
            return {
              kind: 'error',
              message: `${arg} requires a non-negative integer\n${HELP_HINT}`,
            };
          }
          if (parsed < 1) {
            return {
              kind: 'error',
              message: `${arg} requires an integer of at least 1\n${HELP_HINT}`,
            };
          }
          timeoutS = parsed;
        }
      }
      continue;
    }
    if (arg.startsWith('--'))
      return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
    positionals.push(arg);
  }

  if (positionals.length > 0) {
    return { kind: 'error', message: `swarm step takes no positional arguments\n${HELP_HINT}` };
  }
  if (runId === undefined || runId.trim().length === 0) {
    return { kind: 'error', message: `swarm step requires --run <id>\n${HELP_HINT}` };
  }
  return {
    kind: 'swarm-step',
    dir,
    runId,
    ...(model === undefined ? {} : { model }),
    ...(timeoutS === undefined ? {} : { timeoutS }),
    allowWrite,
  };
}

/** Parse the swarm status subcommand arguments. */
function parseStatusTail(argv: readonly string[]): ParseResult {
  let dir = cwd();
  let runId: string | undefined;
  const seen = new Set<string>();
  const positionals: string[] = [];

  /** Reject repeated single-value flags. */
  function takeValue(flag: string, index: number): string | ParseResult {
    if (seen.has(flag)) {
      return { kind: 'error', message: `ambiguous repeated flag: ${flag}\n${HELP_HINT}` };
    }
    seen.add(flag);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-') || next.length === 0) {
      return { kind: 'error', message: `${flag} requires a value\n${HELP_HINT}` };
    }
    return next;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-V') return { kind: 'version' };
    if (arg === '--run' || arg === '--dir') {
      const taken = takeValue(arg, index);
      if (typeof taken !== 'string') return taken;
      index += 1;
      if (arg === '--run') runId = taken;
      else dir = taken;
      continue;
    }
    if (arg.startsWith('--'))
      return { kind: 'error', message: `unknown option: ${arg}\n${HELP_HINT}` };
    positionals.push(arg);
  }

  if (positionals.length > 0) {
    return { kind: 'error', message: `swarm status takes no positional arguments\n${HELP_HINT}` };
  }
  if (runId === undefined || runId.trim().length === 0) {
    return { kind: 'error', message: `swarm status requires --run <id>\n${HELP_HINT}` };
  }
  return { kind: 'swarm-status', dir, runId };
}
