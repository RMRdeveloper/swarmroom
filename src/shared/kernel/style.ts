import pc from 'picocolors';

export type FileStatus = 'new' | 'updated' | 'skipped';
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';

export function status(kind: FileStatus, text: string): string {
  if (kind === 'new') return pc.green(text);
  if (kind === 'updated') return pc.yellow(text);
  return pc.dim(text);
}

export function taskStatus(kind: TaskStatus, text: string): string {
  if (kind === 'completed') return pc.green(text);
  if (kind === 'running') return pc.yellow(text);
  if (kind === 'failed') return pc.red(text);
  return pc.dim(text);
}

export function error(text: string): string {
  return pc.red(text);
}

export function muted(text: string): string {
  return pc.dim(text);
}
