import { isTaskStatus, type Task, type TaskStatus } from './tasks-cli-types.ts';

export const LINE_RE = /^([A-Za-z][A-Za-z0-9_-]*): (.*)$/;

export const VALID_KEYS = new Set([
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
]) as ReadonlySet<string>;

export const VALID_TASK_KEYS: ReadonlySet<string> = VALID_KEYS;

export const REQUIRED_KEYS = ['id', 'status', 'dependsOn', 'title'] as const;

export const REQUIRED_TASK_KEYS: readonly string[] = REQUIRED_KEYS;

export const CANONICAL_ORDER = [
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

export interface Block {
  readonly lines: readonly string[];
  readonly startLine: number;
}

export function normalizeRaw(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
}

export function splitIntoBlocks(normalized: string): readonly Block[] {
  const rawLines = normalized.split('\n');
  const blocks: Block[] = [];
  let current: string[] = [];
  let blockStart = 1;

  for (const [index, line] of rawLines.entries()) {
    const globalLine = index + 1;
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push({ lines: current, startLine: blockStart });
        current = [];
      }
      continue;
    }
    if (current.length === 0) blockStart = globalLine;
    current.push(line);
  }
  if (current.length > 0) blocks.push({ lines: current, startLine: blockStart });
  return blocks;
}

export function splitList(
  value: string,
  sep: string,
  field: string,
  block: number,
  prefix = 'block',
): readonly string[] {
  if (value.trim() === '-') return [];
  if (value.trim() === '') throw new Error(`${prefix} ${String(block)}: ${field} cannot be empty`);
  const parts = value.split(sep).map((part) => part.trim());
  for (const part of parts) {
    if (part.length === 0)
      throw new Error(`${prefix} ${String(block)}: ${field} contains empty element`);
    if (part === '-')
      throw new Error(`${prefix} ${String(block)}: ${field} cannot mix "-" with values`);
  }
  return parts;
}

export function parseBlockRecord(
  lines: readonly string[],
  blockIndex: number,
  startLine: number,
  prefix = 'block',
): ReadonlyMap<string, string> {
  const record = new Map<string, string>();
  for (const [index, line] of lines.entries()) {
    const globalLine = startLine + index;
    const match = LINE_RE.exec(line);
    if (!match)
      throw new Error(
        `${prefix} ${String(blockIndex)} line ${String(globalLine)}: malformed line "${line}"`,
      );
    const key = match[1];
    const val = match[2];
    if (key === undefined || val === undefined)
      throw new Error(
        `${prefix} ${String(blockIndex)} line ${String(globalLine)}: malformed line "${line}"`,
      );
    if (record.has(key)) throw new Error(`${prefix} ${String(blockIndex)}: duplicate key "${key}"`);
    record.set(key, val);
  }
  return record;
}

/**
 * Validate a tasks file path for traversal and encoding safety.
 * Normalizes `\\` to `/`, splits by `/`, and rejects any segment equal to `..`.
 * Allows absolute paths; relative paths are expected under `.swarmroom/tasks/` by callers.
 * Covers `a/../b.tasks` via segment check instead of substring `includes('..')`.
 */
export function assertTasksFileSafe(file: string): string {
  if (file.length === 0) throw new Error('tasksFile must be a non-empty string');
  if (file.includes('\0')) throw new Error('tasksFile must not contain null bytes');
  const normalized = file.replaceAll('\\', '/');
  const parts = normalized.split('/');
  for (const segment of parts) {
    if (segment === '..') throw new Error('tasksFile must not contain `..`');
  }
  return normalized;
}

/** Alias for backward compatibility — validates and returns normalized tasks file path. */
export function validateTasksFile(file: string): string {
  return assertTasksFileSafe(file);
}

export function assertValidKeys(
  record: ReadonlyMap<string, string>,
  blockIndex: number,
  prefix = 'block',
): void {
  for (const key of record.keys()) {
    if (!VALID_KEYS.has(key))
      throw new Error(`${prefix} ${String(blockIndex)}: unknown key "${key}"`);
  }
}

/** Build a Task from a parsed block record, validating all fields. */
export function recordToTask(
  record: ReadonlyMap<string, string>,
  blockIndex: number,
  prefix = 'block',
): Task {
  assertValidKeys(record, blockIndex, prefix);

  for (const key of REQUIRED_KEYS) {
    if (!record.has(key))
      throw new Error(`${prefix} ${String(blockIndex)}: missing field "${key}"`);
  }

  const idValue = record.get('id');
  if (idValue === undefined) throw new Error(`${prefix} ${String(blockIndex)}: missing field "id"`);
  const id = idValue.trim();
  if (id.length === 0)
    throw new Error(`${prefix} ${String(blockIndex)}: id must be a non-empty string`);

  const titleValue = record.get('title');
  if (titleValue === undefined)
    throw new Error(`${prefix} ${String(blockIndex)}: missing field "title"`);
  const title = titleValue.trim();
  if (title.length === 0)
    throw new Error(`${prefix} ${String(blockIndex)}: title must be a non-empty string`);

  const statusValue = record.get('status');
  if (statusValue === undefined)
    throw new Error(`${prefix} ${String(blockIndex)}: missing field "status"`);
  const statusRaw = statusValue.trim();
  if (!isTaskStatus(statusRaw))
    throw new Error(`${prefix} ${String(blockIndex)}: invalid status "${statusRaw}"`);
  const status: TaskStatus = statusRaw;

  const dependsOnValue = record.get('dependsOn');
  if (dependsOnValue === undefined)
    throw new Error(`${prefix} ${String(blockIndex)}: missing field "dependsOn"`);
  const dependsOn: readonly string[] =
    dependsOnValue.trim() === '-'
      ? []
      : splitList(dependsOnValue, ',', 'dependsOn', blockIndex, prefix);

  const descriptionRaw = record.get('description');
  const description =
    descriptionRaw !== undefined && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim()
      : title;

  const agentRaw = record.get('agent');
  let agent: string | undefined;
  if (agentRaw !== undefined) {
    const v = agentRaw.trim();
    if (v.length === 0)
      throw new Error(`${prefix} ${String(blockIndex)}: agent must be a non-empty string`);
    agent = v;
  }

  let files: readonly string[] | undefined;
  const filesRaw = record.get('files');
  if (filesRaw !== undefined) {
    const t = filesRaw.trim();
    if (t === '-') files = undefined;
    else if (t.length === 0)
      throw new Error(`${prefix} ${String(blockIndex)}: files cannot be empty`);
    else files = splitList(filesRaw, ',', 'files', blockIndex, prefix);
  }

  let acceptance: readonly string[] | undefined;
  const acceptanceRaw = record.get('acceptance');
  if (acceptanceRaw !== undefined) {
    const t = acceptanceRaw.trim();
    if (t === '-') acceptance = undefined;
    else if (t.length === 0)
      throw new Error(`${prefix} ${String(blockIndex)}: acceptance cannot be empty`);
    else acceptance = splitList(acceptanceRaw, ';', 'acceptance', blockIndex, prefix);
  }

  let result: string | undefined;
  const resultRaw = record.get('result');
  if (resultRaw !== undefined) {
    const v = resultRaw.trim();
    if (v.length === 0)
      throw new Error(`${prefix} ${String(blockIndex)}: result must be a non-empty string`);
    result = v;
  }

  let error: string | undefined;
  const errorRaw = record.get('error');
  if (errorRaw !== undefined) {
    const v = errorRaw.trim();
    if (v.length === 0)
      throw new Error(`${prefix} ${String(blockIndex)}: error must be a non-empty string`);
    error = v;
  }

  let attempts: number | undefined;
  const attemptsRaw = record.get('attempts');
  if (attemptsRaw !== undefined) {
    const v = attemptsRaw.trim();
    if (!/^-?\d+$/.test(v))
      throw new Error(`${prefix} ${String(blockIndex)}: attempts must be integer >=0, got "${v}"`);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`${prefix} ${String(blockIndex)}: attempts must be integer >=0, got "${v}"`);
    attempts = n;
  }

  return {
    id,
    title,
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
