import type { Scope, Target } from './install-targets.ts';

/** Shared kernel: TaskStatus + TasksCommand types for CLI and tasks-cli. */

/** Task statuses shared between CLI and task domain. */
export const TASK_STATUSES = [
  'pending',
  'ready',
  'running',
  'blocked',
  'completed',
  'failed',
] as const;

/** Status of a task node. */
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Core task node shared between CLI and domain. */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dependsOn: readonly string[];
  readonly agent?: string;
  readonly files?: readonly string[];
  readonly acceptance?: readonly string[];
  readonly result?: string;
  readonly error?: string;
  readonly attempts?: number;
}

/** Type guard for TaskStatus values. */
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/** Command variant for the tasks CLI surface. */
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

/** CLI parse outcome, shared between install and tasks parsers. */
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
    }
  | {
      readonly kind: 'swarm-run';
      readonly dir: string;
      /** Only harness the orchestrated runtime supports. */
      readonly harness: 'opencode' | 'pi';
      readonly request: string;
      readonly model?: string;
      /** User trivial confirmation. Undefined means ask via gate when interactive. */
      readonly trivial?: boolean;
      readonly lines?: number;
      readonly files?: number;
      readonly addsDependency?: boolean;
      readonly designDecision?: boolean;
      readonly settledUnderstanding?: string;
      readonly settledFile?: string;
      readonly maxPasses?: number;
      readonly timeoutS?: number;
      readonly allowWrite?: boolean;
    }
  | {
      readonly kind: 'swarm-start';
      readonly dir: string;
      /** Only harness the orchestrated runtime supports. */
      readonly harness: 'opencode' | 'pi';
      readonly request: string;
      readonly model?: string;
      /** Trivial only with the flag; undefined means non-trivial. */
      readonly trivial?: boolean;
      readonly lines?: number;
      readonly files?: number;
      readonly addsDependency?: boolean;
      readonly designDecision?: boolean;
      readonly settledUnderstanding?: string;
      readonly settledFile?: string;
      readonly maxPasses?: number;
      readonly timeoutS?: number;
    }
  | {
      readonly kind: 'swarm-step';
      readonly dir: string;
      readonly runId: string;
      readonly model?: string;
      readonly timeoutS?: number;
      readonly allowWrite: boolean;
    }
  | {
      readonly kind: 'swarm-status';
      readonly dir: string;
      readonly runId: string;
    };

/** Install options returned on successful parse. */
export interface Options {
  readonly chosen: readonly Target[];
  readonly scope: Scope;
  readonly dir: string;
  readonly force: boolean;
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly explicit: boolean;
  readonly dryRun: boolean;
  /** Install the Pi extension + skill instead of (or besides) editor targets. */
  readonly pi: boolean;
}
