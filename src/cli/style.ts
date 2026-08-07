import pc from 'picocolors';

import type { FileStatus } from '../io/installer.ts';

/** Color a file-status label: new=green, updated=yellow, skipped=dim. */
export function status(kind: FileStatus, text: string): string {
  if (kind === 'new') return pc.green(text);
  if (kind === 'updated') return pc.yellow(text);
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
