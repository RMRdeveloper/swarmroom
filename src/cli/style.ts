import pc from 'picocolors';

import type { TaskStatus } from '../domain/tasks.ts';
import type { FileStatus } from '../io/installer.ts';

/** Color a file-status label: new=green, updated=yellow, skipped=dim. */
export function status(kind: FileStatus, text: string): string {
  if (kind === 'new') return pc.green(text);
  if (kind === 'updated') return pc.yellow(text);
  return pc.dim(text);
}

/** Color a task-status label: completed=green, running=yellow, failed=red, else dim. */
export function taskStatus(kind: TaskStatus, text: string): string {
  if (kind === 'completed') return pc.green(text);
  if (kind === 'running') return pc.yellow(text);
  if (kind === 'failed') return pc.red(text);
  return pc.dim(text);
}

/** Red error text (TTY + NO_COLOR aware via picocolors). */
export function error(text: string): string {
  return pc.red(text);
}

/** Muted brand / secondary text. */
export function muted(text: string): string {
  return pc.dim(text);
}
