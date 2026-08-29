import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import {
  assertTasksFileSafe,
  CANONICAL_ORDER,
  normalizeRaw,
  parseBlockRecord,
  recordToTask,
  splitIntoBlocks,
} from '../../shared/kernel/tasks-format.ts';

import { createGraph, type Task, type TaskGraph } from './tasks.ts';

export const TASKS_DIR = '.swarmroom';
export const TASKS_SUBDIR = 'tasks';

function isAbsent(err: unknown): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Prevents escaping the project .swarmroom/tasks tree via `..`. Validates absolute paths too. */
export function taskGraphPath(projectRoot: string, tasksFile: string): string {
  const normalized = assertTasksFileSafe(tasksFile);
  if (isAbsolute(tasksFile)) return normalized;
  return join(projectRoot, TASKS_DIR, TASKS_SUBDIR, normalized);
}

/** Parse a single block into a Task via the shared kernel. */
function parseBlock(lines: readonly string[], blockIndex: number, startLine: number): Task {
  const record = parseBlockRecord(lines, blockIndex, startLine, 'block');
  return recordToTask(record, blockIndex, 'block');
}

/** Fail fast on invalid block syntax, shape, status, or graph invariants. No JSON support. */
export function parseTaskGraph(raw: string): TaskGraph {
  const normalized = normalizeRaw(raw);
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error('legacy JSON format not supported — expected .tasks blocks of field: value');
  }

  if (normalized.trim() === '') return createGraph([]);

  const blocks = splitIntoBlocks(normalized);

  const tasks: Task[] = [];
  for (const [i, block] of blocks.entries()) {
    tasks.push(parseBlock(block.lines, i + 1, block.startLine));
  }

  return createGraph(tasks);
}

function serializeTask(task: Task): string {
  const lines: string[] = [];
  const record: Record<string, string> = {
    id: task.id,
    status: task.status,
    dependsOn: task.dependsOn.length === 0 ? '-' : task.dependsOn.join(', '),
    title: task.title,
    ...(task.agent === undefined ? {} : { agent: task.agent }),
    ...(task.description === task.title ? {} : { description: task.description }),
    ...(task.files === undefined || task.files.length === 0
      ? {}
      : { files: task.files.join(', ') }),
    ...(task.acceptance === undefined || task.acceptance.length === 0
      ? {}
      : { acceptance: task.acceptance.join('; ') }),
    ...(task.result === undefined ? {} : { result: task.result }),
    ...(task.error === undefined ? {} : { error: task.error }),
    ...(task.attempts === undefined ? {} : { attempts: String(task.attempts) }),
  };

  for (const key of CANONICAL_ORDER) {
    const v = record[key];
    if (v !== undefined) lines.push(`${key}: ${v}`);
  }
  return lines.join('\n');
}

export function serializeTaskGraph(graph: TaskGraph): string {
  if (graph.tasks.length === 0) return '';
  return `${graph.tasks.map((task) => serializeTask(task)).join('\n\n')}\n`;
}

export async function readTaskGraph(
  projectRoot: string,
  tasksFile: string,
): Promise<TaskGraph | null> {
  try {
    const raw = await readFile(taskGraphPath(projectRoot, tasksFile), 'utf8');
    return parseTaskGraph(raw);
  } catch (error) {
    if (isAbsent(error)) return null;
    throw error;
  }
}

export async function writeTaskGraph(
  projectRoot: string,
  graph: TaskGraph,
  tasksFile: string,
): Promise<string> {
  const dest = taskGraphPath(projectRoot, tasksFile);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, serializeTaskGraph(graph), 'utf8');
  return dest;
}
