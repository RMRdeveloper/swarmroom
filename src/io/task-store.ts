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

const VALID_KEYS = new Set([
  'id',
  'status',
  'dependsOn',
  'agent',
  'title',
  'description',
  'files',
  'acceptance',
  'result',
  'error',
  'attempts',
]);
const REQUIRED_KEYS = ['id', 'status', 'dependsOn', 'title'] as const;
const LINE_RE = /^([A-Za-z]+): (.*)$/;
const CANONICAL_ORDER = [
  'id',
  'status',
  'dependsOn',
  'agent',
  'title',
  'description',
  'files',
  'acceptance',
  'result',
  'error',
  'attempts',
] as const;

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

function splitList(value: string, sep: string, field: string, block: number): readonly string[] {
  if (value === '-') return [];
  if (value.includes('-') && value.trim() === '-') {
    // handled above; mixture with "-" is invalid
  }
  if (value.trim() === '') throw new Error(`bloque ${block}: ${field} no puede ser vacío`);
  const parts = value.split(sep).map((p) => p.trim());
  for (const part of parts) {
    if (part.length === 0) throw new Error(`bloque ${block}: ${field} contiene elemento vacío`);
    if (part === '-') throw new Error(`bloque ${block}: ${field} no puede mezclar "-" con valores`);
  }
  return parts;
}

function parseBlock(
  lines: readonly string[],
  blockIndex: number,
  startLine: number,
): Task {
  const record = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const globalLine = startLine + i;
    const m = line.match(LINE_RE);
    if (!m) throw new Error(`bloque ${blockIndex} línea ${globalLine}: línea malformada "${line}"`);
    const key = m[1]!;
    const value = m[2]!;
    if (!VALID_KEYS.has(key)) throw new Error(`bloque ${blockIndex}: clave desconocida "${key}"`);
    if (record.has(key)) throw new Error(`bloque ${blockIndex}: clave duplicada "${key}"`);
    record.set(key, value);
  }

  for (const key of REQUIRED_KEYS) {
    if (!record.has(key)) throw new Error(`bloque ${blockIndex}: falta campo "${key}"`);
  }

  const idRaw = record.get('id')!.trim();
  if (idRaw.length === 0) throw new Error(`bloque ${blockIndex}: id debe ser string no vacío`);
  const titleRaw = record.get('title')!.trim();
  if (titleRaw.length === 0) throw new Error(`bloque ${blockIndex}: title debe ser string no vacío`);

  const statusRaw = record.get('status')!.trim();
  if (!isTaskStatus(statusRaw)) throw new Error(`bloque ${blockIndex}: status inválido "${statusRaw}"`);
  const status: TaskStatus = statusRaw;

  const dependsOnRaw = record.get('dependsOn')!;
  // dependsOn is already trimmed via splitList; handle "-" sentinel
  let dependsOn: readonly string[];
  if (dependsOnRaw.trim() === '-') dependsOn = [];
  else {
    dependsOn = splitList(dependsOnRaw, ',', 'dependsOn', blockIndex);
  }

  const descriptionRaw = record.get('description');
  const description = descriptionRaw !== undefined && descriptionRaw.trim().length > 0
    ? descriptionRaw.trim()
    : titleRaw;

  const agentRaw = record.get('agent');
  let agent: string | undefined;
  if (agentRaw !== undefined) {
    const v = agentRaw.trim();
    if (v.length === 0) throw new Error(`bloque ${blockIndex}: agent debe ser string no vacío`);
    agent = v;
  }

  let files: readonly string[] | undefined;
  const filesRaw = record.get('files');
  if (filesRaw !== undefined) {
    const t = filesRaw.trim();
    if (t === '-') files = undefined;
    else if (t.length === 0) throw new Error(`bloque ${blockIndex}: files no puede ser vacío`);
    else files = splitList(filesRaw, ',', 'files', blockIndex);
  }

  let acceptance: readonly string[] | undefined;
  const acceptanceRaw = record.get('acceptance');
  if (acceptanceRaw !== undefined) {
    const t = acceptanceRaw.trim();
    if (t === '-') acceptance = undefined;
    else if (t.length === 0) throw new Error(`bloque ${blockIndex}: acceptance no puede ser vacío`);
    else acceptance = splitList(acceptanceRaw, ';', 'acceptance', blockIndex);
  }

  let result: string | undefined;
  const resultRaw = record.get('result');
  if (resultRaw !== undefined) {
    const v = resultRaw.trim();
    if (v.length === 0) throw new Error(`bloque ${blockIndex}: result debe ser string no vacío`);
    result = v;
  }

  let error: string | undefined;
  const errorRaw = record.get('error');
  if (errorRaw !== undefined) {
    const v = errorRaw.trim();
    if (v.length === 0) throw new Error(`bloque ${blockIndex}: error debe ser string no vacío`);
    error = v;
  }

  let attempts: number | undefined;
  const attemptsRaw = record.get('attempts');
  if (attemptsRaw !== undefined) {
    const v = attemptsRaw.trim();
    if (!/^-?\d+$/.test(v)) throw new Error(`bloque ${blockIndex}: attempts debe ser entero >=0, got "${v}"`);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`bloque ${blockIndex}: attempts debe ser entero >=0, got "${v}"`);
    attempts = n;
  }

  return {
    id: idRaw,
    title: titleRaw,
    description,
    status,
    dependsOn,
    ...(agent !== undefined ? { agent } : {}),
    ...(files !== undefined ? { files } : {}),
    ...(acceptance !== undefined ? { acceptance } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(attempts !== undefined ? { attempts } : {}),
  };
}

/** Fail fast on invalid block syntax, shape, status, or graph invariants. No JSON support. */
export function parseTaskGraph(raw: string): TaskGraph {
  // Strip BOM and normalize CRLF
  let normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  // Legacy JSON detection — total break, no fallback
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error('formato JSON legacy no soportado — se esperaba .tasks en bloques campo: valor');
  }

  if (normalized.trim() === '') return createGraph([]);

  const rawLines = normalized.split('\n');
  const blocks: { lines: string[]; startLine: number }[] = [];
  let current: string[] = [];
  let blockStart = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const globalLine = i + 1;
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push({ lines: current, startLine: blockStart });
        current = [];
      }
      // next non-empty line will set new blockStart
      continue;
    }
    if (current.length === 0) blockStart = globalLine;
    current.push(line);
  }
  if (current.length > 0) blocks.push({ lines: current, startLine: blockStart });

  const tasks: Task[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    tasks.push(parseBlock(b.lines, i + 1, b.startLine));
  }

  return createGraph(tasks);
}

function serializeTask(task: Task): string {
  const lines: string[] = [];
  const record: Record<string, string> = {};

  record.id = task.id;
  record.status = task.status;
  record.dependsOn = task.dependsOn.length === 0 ? '-' : task.dependsOn.join(', ');
  if (task.agent !== undefined) record.agent = task.agent;
  record.title = task.title;
  if (task.description !== task.title) record.description = task.description;
  if (task.files !== undefined && task.files.length > 0) record.files = task.files.join(', ');
  if (task.acceptance !== undefined && task.acceptance.length > 0) record.acceptance = task.acceptance.join('; ');
  if (task.result !== undefined) record.result = task.result;
  if (task.error !== undefined) record.error = task.error;
  if (task.attempts !== undefined) record.attempts = String(task.attempts);

  for (const key of CANONICAL_ORDER) {
    const v = record[key];
    if (v !== undefined) lines.push(`${key}: ${v}`);
  }
  return lines.join('\n');
}

export function serializeTaskGraph(graph: TaskGraph): string {
  if (graph.tasks.length === 0) return '';
  return `${graph.tasks.map(serializeTask).join('\n\n')}\n`;
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
