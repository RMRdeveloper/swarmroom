import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import {
  assertValidKeys,
  CANONICAL_ORDER,
  normalizeRaw,
  parseBlockRecord,
  REQUIRED_KEYS,
  splitIntoBlocks,
  splitList,
} from '../../shared/kernel/tasks-format.ts';

import { createGraph, isTaskStatus, type Task, type TaskGraph, type TaskStatus } from './tasks.ts';

export const TASKS_DIR = '.swarmroom';
export const TASKS_SUBDIR = 'tasks';

function isAbsent(err: unknown): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Prevents escaping the project .swarmroom/tasks tree via `..`. */
export function taskGraphPath(projectRoot: string, tasksFile: string): string {
  if (tasksFile.length === 0) throw new Error('tasksFile must be a non-empty string');
  if (isAbsolute(tasksFile)) return tasksFile;
  if (tasksFile.includes('\0')) throw new Error('tasksFile must not contain null bytes');
  const normalized = tasksFile.replaceAll('\\', '/');
  const parts = normalized.split('/');
  for (const p of parts) {
    if (p === '..') throw new Error('tasksFile must not contain `..`');
  }
  return join(projectRoot, TASKS_DIR, TASKS_SUBDIR, tasksFile);
}

function parseBlock(lines: readonly string[], blockIndex: number, startLine: number): Task {
  const record = parseBlockRecord(lines, blockIndex, startLine, 'bloque');
  assertValidKeys(record, blockIndex, 'bloque');

  for (const key of REQUIRED_KEYS) {
    if (!record.has(key)) throw new Error(`bloque ${String(blockIndex)}: falta campo "${key}"`);
  }

  const idValue = record.get('id');
  if (idValue === undefined) throw new Error(`bloque ${String(blockIndex)}: falta campo "id"`);
  const idRaw = idValue.trim();
  if (idRaw.length === 0)
    throw new Error(`bloque ${String(blockIndex)}: id debe ser string no vacío`);
  const titleValue = record.get('title');
  if (titleValue === undefined)
    throw new Error(`bloque ${String(blockIndex)}: falta campo "title"`);
  const titleRaw = titleValue.trim();
  if (titleRaw.length === 0)
    throw new Error(`bloque ${String(blockIndex)}: title debe ser string no vacío`);

  const statusValue = record.get('status');
  if (statusValue === undefined)
    throw new Error(`bloque ${String(blockIndex)}: falta campo "status"`);
  const statusRaw = statusValue.trim();
  if (!isTaskStatus(statusRaw))
    throw new Error(`bloque ${String(blockIndex)}: status inválido "${statusRaw}"`);
  const status: TaskStatus = statusRaw;

  const dependsOnValue = record.get('dependsOn');
  if (dependsOnValue === undefined)
    throw new Error(`bloque ${String(blockIndex)}: falta campo "dependsOn"`);
  const dependsOnRaw = dependsOnValue;
  const dependsOn: readonly string[] =
    dependsOnRaw.trim() === '-' ? [] : splitList(dependsOnRaw, ',', 'dependsOn', blockIndex);

  const descriptionRaw = record.get('description');
  const description =
    descriptionRaw !== undefined && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim()
      : titleRaw;

  const agentRaw = record.get('agent');
  let agent: string | undefined;
  if (agentRaw !== undefined) {
    const v = agentRaw.trim();
    if (v.length === 0)
      throw new Error(`bloque ${String(blockIndex)}: agent debe ser string no vacío`);
    agent = v;
  }

  let files: readonly string[] | undefined;
  const filesRaw = record.get('files');
  if (filesRaw !== undefined) {
    const t = filesRaw.trim();
    if (t === '-') files = undefined;
    else if (t.length === 0)
      throw new Error(`bloque ${String(blockIndex)}: files no puede ser vacío`);
    else files = splitList(filesRaw, ',', 'files', blockIndex);
  }

  let acceptance: readonly string[] | undefined;
  const acceptanceRaw = record.get('acceptance');
  if (acceptanceRaw !== undefined) {
    const t = acceptanceRaw.trim();
    if (t === '-') acceptance = undefined;
    else if (t.length === 0)
      throw new Error(`bloque ${String(blockIndex)}: acceptance no puede ser vacío`);
    else acceptance = splitList(acceptanceRaw, ';', 'acceptance', blockIndex);
  }

  let result: string | undefined;
  const resultRaw = record.get('result');
  if (resultRaw !== undefined) {
    const v = resultRaw.trim();
    if (v.length === 0)
      throw new Error(`bloque ${String(blockIndex)}: result debe ser string no vacío`);
    result = v;
  }

  let error: string | undefined;
  const errorRaw = record.get('error');
  if (errorRaw !== undefined) {
    const v = errorRaw.trim();
    if (v.length === 0)
      throw new Error(`bloque ${String(blockIndex)}: error debe ser string no vacío`);
    error = v;
  }

  let attempts: number | undefined;
  const attemptsRaw = record.get('attempts');
  if (attemptsRaw !== undefined) {
    const v = attemptsRaw.trim();
    if (!/^-?\d+$/.test(v))
      throw new Error(`bloque ${String(blockIndex)}: attempts debe ser entero >=0, got "${v}"`);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`bloque ${String(blockIndex)}: attempts debe ser entero >=0, got "${v}"`);
    attempts = n;
  }

  return {
    id: idRaw,
    title: titleRaw,
    description,
    status,
    dependsOn,
    ...(agent === undefined ? {} : { agent }),
    ...(files === undefined ? {} : { files }),
    ...(acceptance === undefined ? {} : { acceptance }),
    ...(result === undefined ? {} : { result }),
    ...(error === undefined ? {} : { error }),
    ...(attempts === undefined ? {} : { attempts }),
  };
}

/** Fail fast on invalid block syntax, shape, status, or graph invariants. No JSON support. */
export function parseTaskGraph(raw: string): TaskGraph {
  const normalized = normalizeRaw(raw);
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error(
      'formato JSON legacy no soportado — se esperaba .tasks en bloques campo: valor',
    );
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
