export const LINE_RE = /^([A-Za-z]+): (.*)$/;

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
  return raw.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
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
  prefix = 'bloque',
): readonly string[] {
  if (value === '-') return [];
  if (value.trim() === '')
    throw new Error(`${prefix} ${String(block)}: ${field} no puede ser vacío`);
  const parts = value.split(sep).map((part) => part.trim());
  for (const part of parts) {
    if (part.length === 0)
      throw new Error(`${prefix} ${String(block)}: ${field} contiene elemento vacío`);
    if (part === '-')
      throw new Error(`${prefix} ${String(block)}: ${field} no puede mezclar "-" con valores`);
  }
  return parts;
}

export function parseBlockRecord(
  lines: readonly string[],
  blockIndex: number,
  startLine: number,
  prefix = 'bloque',
): ReadonlyMap<string, string> {
  const record = new Map<string, string>();
  for (const [index, line] of lines.entries()) {
    const globalLine = startLine + index;
    const match = LINE_RE.exec(line);
    if (!match)
      throw new Error(
        `${prefix} ${String(blockIndex)} línea ${String(globalLine)}: línea malformada "${line}"`,
      );
    const key = match[1];
    const val = match[2];
    if (key === undefined || val === undefined)
      throw new Error(
        `${prefix} ${String(blockIndex)} línea ${String(globalLine)}: línea malformada "${line}"`,
      );
    if (record.has(key))
      throw new Error(`${prefix} ${String(blockIndex)}: clave duplicada "${key}"`);
    record.set(key, val);
  }
  return record;
}

export function assertValidKeys(
  record: ReadonlyMap<string, string>,
  blockIndex: number,
  prefix = 'bloque',
): void {
  for (const key of record.keys()) {
    if (!VALID_KEYS.has(key))
      throw new Error(`${prefix} ${String(blockIndex)}: clave desconocida "${key}"`);
  }
}
