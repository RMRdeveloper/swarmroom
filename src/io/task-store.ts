import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import {
  createGraph,
  isTaskStatus,
  type Task,
  type TaskGraph,
  type TaskStatus,
} from '../domain/tasks.ts';

export const TASKS_DIR = '.swarmroom';
export const TASKS_SUBDIR = 'tasks';

const ROOT_KEYS = new Set(['tasks']);
const REQUIRED_TASK_KEYS = ['id', 'title', 'description', 'status', 'dependsOn'] as const;
const TASK_KEYS = new Set([
  ...REQUIRED_TASK_KEYS,
  'agent',
  'files',
  'acceptance',
  'result',
  'error',
  'attempts',
]);

function isAbsent(err: unknown): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export function taskGraphPath(projectRoot: string, tasksFile: string): string {
  if (tasksFile.length === 0) throw new Error('tasksFile must be a non-empty string');
  if (isAbsolute(tasksFile)) return tasksFile;
  if (tasksFile.includes('\0')) throw new Error('tasksFile must not contain null bytes');
  // Prevent escaping the project .swarmroom/tasks tree via `..`
  const normalized = tasksFile.replace(/\\/g, '/');
  const parts = normalized.split('/');
  for (const p of parts) {
    if (p === '..') throw new Error('tasksFile must not contain `..`');
  }
  return join(projectRoot, TASKS_DIR, TASKS_SUBDIR, tasksFile);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return assertString(value, label);
}

function optionalStringArray(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return assertStringArray(value, label);
}

function optionalAttempts(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`attempts must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

function parseTask(raw: unknown, index: number): Task {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`tasks[${index}] must be an object`);
  }
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!TASK_KEYS.has(key)) {
      throw new Error(`tasks[${index}] unknown key: ${key}`);
    }
  }
  for (const key of REQUIRED_TASK_KEYS) {
    if (!(key in rec)) throw new Error(`tasks[${index}] missing ${key}`);
  }
  const statusRaw = rec.status;
  if (typeof statusRaw !== 'string' || !isTaskStatus(statusRaw)) {
    throw new Error(`tasks[${index}] has invalid status: ${String(statusRaw)}`);
  }
  const status: TaskStatus = statusRaw;
  const parsed: Task = {
    id: assertString(rec.id, `tasks[${index}].id`),
    title: assertString(rec.title, `tasks[${index}].title`),
    description: assertString(rec.description, `tasks[${index}].description`),
    status,
    dependsOn: assertStringArray(rec.dependsOn, `tasks[${index}].dependsOn`),
  };
  const agent = optionalString(rec.agent, `tasks[${index}].agent`);
  const files = optionalStringArray(rec.files, `tasks[${index}].files`);
  const acceptance = optionalStringArray(rec.acceptance, `tasks[${index}].acceptance`);
  const result = optionalString(rec.result, `tasks[${index}].result`);
  const error = optionalString(rec.error, `tasks[${index}].error`);
  const attempts = optionalAttempts(rec.attempts);
  return {
    ...parsed,
    ...(agent !== undefined ? { agent } : {}),
    ...(files !== undefined ? { files } : {}),
    ...(acceptance !== undefined ? { acceptance } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(attempts !== undefined ? { attempts } : {}),
  };
}

/** Fail fast on invalid JSON, shape, status, or graph invariants. */
export function parseTaskGraph(raw: string): TaskGraph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid task graph JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('task graph root must be an object');
  }
  const rec = parsed as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!ROOT_KEYS.has(key)) {
      throw new Error(`unknown task graph key: ${key}`);
    }
  }
  if (!Array.isArray(rec.tasks)) {
    throw new Error('task graph missing tasks array');
  }
  const tasks = rec.tasks.map((item, i) => parseTask(item, i));
  return createGraph(tasks);
}

export function serializeTaskGraph(graph: TaskGraph): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

export async function readTaskGraph(projectRoot: string, tasksFile: string): Promise<TaskGraph | null> {
  try {
    const raw = await readFile(taskGraphPath(projectRoot, tasksFile), 'utf8');
    return parseTaskGraph(raw);
  } catch (err) {
    if (isAbsent(err)) return null;
    throw err;
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
