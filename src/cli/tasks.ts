import { readFile } from 'node:fs/promises';

import type { Task, TaskGraph, TaskStatus } from '../domain/tasks.ts';
import { isTaskStatus, propagateFailure, withError, withResult, withStatus } from '../domain/tasks.ts';
import { applyReplan, selectRunnable, type ReplanProposal } from '../domain/scheduler.ts';
import { readTaskGraph, taskGraphPath, writeTaskGraph } from '../io/task-store.ts';
import type { TasksCommand } from './args.ts';
import * as style from './style.ts';

const GLYPH: Record<TaskStatus, string> = {
  completed: '✓',
  running: '●',
  failed: '✗',
  blocked: '○',
  pending: '○',
  ready: '○',
};

const SUMMARY_ORDER: readonly TaskStatus[] = [
  'completed',
  'running',
  'failed',
  'blocked',
  'pending',
  'ready',
];

export function glyphFor(status: TaskStatus): string {
  return GLYPH[status];
}

export function formatTaskLines(graph: TaskGraph): readonly string[] {
  return graph.tasks.map((task) => {
    const glyph = glyphFor(task.status);
    return style.taskStatus(task.status, `${glyph} ${task.id} ${task.title}`);
  });
}

export function formatTaskSummary(graph: TaskGraph): string {
  const counts = Object.fromEntries(SUMMARY_ORDER.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const task of graph.tasks) counts[task.status] += 1;
  return SUMMARY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ');
}

export function renderTasks(
  graph: TaskGraph | null,
  options: { readonly dir: string; readonly tasksFile: string },
): string {
  if (!graph) return `No task graph at ${taskGraphPath(options.dir, options.tasksFile)}.`;
  const lines = formatTaskLines(graph);
  const summary = formatTaskSummary(graph) || '0 tasks';
  if (lines.length === 0) return `\n${summary}`;
  return `${lines.join('\n')}\n\n${summary}`;
}

export async function runTasks(options: {
  readonly dir: string;
  readonly tasksFile: string;
  readonly command?: TasksCommand;
}): Promise<void> {
  return runTaskCommand({ ...options, command: options.command ?? { kind: 'status' } });
}

function requireGraph(graph: TaskGraph | null, dir: string, tasksFile: string): TaskGraph {
  if (!graph) throw new Error(`No task graph at ${taskGraphPath(dir, tasksFile)}.`);
  return graph;
}

const VALID_TASK_KEYS = new Set([
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
const LINE_RE = /^([A-Za-z]+): (.*)$/;

// NOTE: Block parsing and Task validation are intentionally duplicated with
// src/io/task-store.ts. task-store is the core .tasks parser; this file adds
// replan-specific discrimination (task vs dependency blocks). Full extraction
// to a shared parser is deferred to the next minor to avoid destabilizing the
// 2.2.0 publish — see FINDING 1/2/5. splitList is kept in sync (FINDING 6).
// Direct fs import is tolerated pre-publish (FINDING 8).

function splitList(value: string, sep: string, field: string, block: number): readonly string[] {
  if (value === '-') return [];
  if (value.trim() === '') throw new Error(`replan bloque ${block}: ${field} no puede ser vacío`);
  const parts = value.split(sep).map((p) => p.trim());
  for (const part of parts) {
    if (part.length === 0) throw new Error(`replan bloque ${block}: ${field} contiene elemento vacío`);
    if (part === '-') throw new Error(`replan bloque ${block}: ${field} no puede mezclar "-" con valores`);
  }
  return parts;
}

async function readProposal(file: string): Promise<ReplanProposal> {
  const raw = await readFile(file, 'utf8');
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error('formato JSON legacy no soportado en propuesta — se esperaba bloques campo: valor');
  }
  if (normalized.trim() === '') return {};

  const rawLines = normalized.split('\n');
  type Block = { lines: string[]; startLine: number };
  const blocks: Block[] = [];
  let current: string[] = [];
  let blockStart = 1;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push({ lines: current, startLine: blockStart });
        current = [];
      }
      continue;
    }
    if (current.length === 0) blockStart = i + 1;
    current.push(line);
  }
  if (current.length > 0) blocks.push({ lines: current, startLine: blockStart });

  const addTasks: Task[] = [];
  const addDependencies: { readonly id: string; readonly dependsOn: string }[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!;
    const n = bi + 1;
    const rec = new Map<string, string>();
    for (let li = 0; li < block.lines.length; li++) {
      const line = block.lines[li]!;
      const m = line.match(LINE_RE);
      if (!m) throw new Error(`replan bloque ${n} línea ${block.startLine + li}: línea malformada "${line}"`);
      const k = m[1]!;
      const v = m[2]!;
      if (rec.has(k)) throw new Error(`replan bloque ${n}: clave duplicada "${k}"`);
      rec.set(k, v);
    }

    const isDependencyBlock = rec.size === 2 && rec.has('id') && rec.has('dependsOn');

    if (!isDependencyBlock) {
      for (const k of rec.keys()) {
        if (!VALID_TASK_KEYS.has(k)) throw new Error(`replan bloque ${n}: clave desconocida "${k}"`);
      }
      for (const k of ['id', 'title', 'status', 'dependsOn']) {
        if (!rec.has(k)) throw new Error(`replan bloque ${n}: falta campo "${k}"`);
      }
      const id = rec.get('id')!.trim();
      const title = rec.get('title')!.trim();
      const statusRaw = rec.get('status')!.trim();
      const dependsOnRaw = rec.get('dependsOn')!;
      const descriptionRaw = rec.get('description');
      if (id.length === 0) throw new Error(`replan bloque ${n}: id debe ser string no vacío`);
      if (title.length === 0) throw new Error(`replan bloque ${n}: title debe ser string no vacío`);
      if (!isTaskStatus(statusRaw)) throw new Error(`replan bloque ${n}: status inválido "${statusRaw}"`);
      const description = descriptionRaw !== undefined && descriptionRaw.trim().length > 0 ? descriptionRaw.trim() : title;
      if (description.length === 0) throw new Error(`replan bloque ${n}: description debe ser string no vacío`);
      let dependsOn: readonly string[];
      if (dependsOnRaw.trim() === '-') dependsOn = [];
      else {
        dependsOn = splitList(dependsOnRaw, ',', 'dependsOn', n);
      }
      const agentRaw = rec.get('agent');
      let agent: string | undefined;
      if (agentRaw !== undefined) {
        const v = agentRaw.trim();
        if (v.length === 0) throw new Error(`replan bloque ${n}: agent debe ser string no vacío`);
        agent = v;
      }
      let files: readonly string[] | undefined;
      const filesRaw = rec.get('files');
      if (filesRaw !== undefined) {
        const t = filesRaw.trim();
        if (t !== '-') {
          if (t.length === 0) throw new Error(`replan bloque ${n}: files no puede ser vacío`);
          files = splitList(filesRaw, ',', 'files', n);
        }
      }
      let acceptance: readonly string[] | undefined;
      const acceptanceRaw = rec.get('acceptance');
      if (acceptanceRaw !== undefined) {
        const t = acceptanceRaw.trim();
        if (t !== '-') {
          if (t.length === 0) throw new Error(`replan bloque ${n}: acceptance no puede ser vacío`);
          acceptance = splitList(acceptanceRaw, ';', 'acceptance', n);
        }
      }
      let result: string | undefined;
      const resultRaw = rec.get('result');
      if (resultRaw !== undefined) {
        const v = resultRaw.trim();
        if (v.length === 0) throw new Error(`replan bloque ${n}: result debe ser string no vacío`);
        result = v;
      }
      let error: string | undefined;
      const errorRaw = rec.get('error');
      if (errorRaw !== undefined) {
        const v = errorRaw.trim();
        if (v.length === 0) throw new Error(`replan bloque ${n}: error debe ser string no vacío`);
        error = v;
      }
      let attempts: number | undefined;
      const attemptsRaw = rec.get('attempts');
      if (attemptsRaw !== undefined) {
        const v = attemptsRaw.trim();
        if (!/^-?\d+$/.test(v)) throw new Error(`replan bloque ${n}: attempts debe ser entero >=0, got "${v}"`);
        const num = Number(v);
        if (!Number.isInteger(num) || num < 0) throw new Error(`replan bloque ${n}: attempts debe ser entero >=0, got "${v}"`);
        attempts = num;
      }

      const task: Task = {
        id,
        title,
        description,
        status: statusRaw as TaskStatus,
        dependsOn,
        ...(agent !== undefined ? { agent } : {}),
        ...(files !== undefined ? { files } : {}),
        ...(acceptance !== undefined ? { acceptance } : {}),
        ...(result !== undefined ? { result } : {}),
        ...(error !== undefined ? { error } : {}),
        ...(attempts !== undefined ? { attempts } : {}),
      };
      addTasks.push(task);
    } else {
      const allowed = new Set(['id', 'dependsOn']);
      for (const k of rec.keys()) {
        if (!allowed.has(k)) throw new Error(`replan bloque ${n}: clave desconocida "${k}" (en bloque de dependencia solo id/dependsOn)`);
      }
      if (!rec.has('id')) throw new Error(`replan bloque ${n}: falta campo "id"`);
      if (!rec.has('dependsOn')) throw new Error(`replan bloque ${n}: falta campo "dependsOn"`);
      const id = rec.get('id')!.trim();
      const dep = rec.get('dependsOn')!.trim();
      if (id.length === 0) throw new Error(`replan bloque ${n}: id debe ser string no vacío`);
      if (dep.length === 0) throw new Error(`replan bloque ${n}: dependsOn debe ser string no vacío`);
      if (dep === '-') throw new Error(`replan bloque ${n}: dependsOn no puede ser "-" en dependencia`);
      if (dep.includes(',')) throw new Error(`replan bloque ${n}: dependsOn en dependencia debe ser un solo id`);
      if (dep.includes(';')) throw new Error(`replan bloque ${n}: dependsOn en dependencia debe ser un solo id`);
      addDependencies.push({ id, dependsOn: dep });
    }
  }

  const proposal: ReplanProposal = {
    ...(addTasks.length > 0 ? { addTasks } : {}),
    ...(addDependencies.length > 0 ? { addDependencies } : {}),
  };
  return proposal;
}

export function humanReady(graph: TaskGraph): string {
  const ready = selectRunnable(graph);
  if (ready.length === 0) return 'No ready tasks.';
  return ready.map((task) => `${task.id} ${task.title}`).join('\n');
}

export async function runTaskCommand(options: {
  readonly command: TasksCommand;
  readonly dir: string;
  readonly tasksFile: string;
}): Promise<void> {
  const graph = await readTaskGraph(options.dir, options.tasksFile);
  const command = options.command;

  if (command.kind === 'status') {
    const output = renderTasks(graph, options);
    console.log(output);
    return;
  }
  if (command.kind === 'validate') {
    const validGraph = requireGraph(graph, options.dir, options.tasksFile);
    console.log(`Valid task graph: ${validGraph.tasks.length} tasks.`);
    return;
  }
  if (command.kind === 'ready') {
    const validGraph = requireGraph(graph, options.dir, options.tasksFile);
    console.log(`${humanReady(validGraph)}`);
    return;
  }
  if (command.kind === 'set') {
    const current = requireGraph(graph, options.dir, options.tasksFile);
    const next = command.result !== undefined
      ? withResult(current, command.id, command.result)
      : command.error !== undefined
        ? propagateFailure(withError(current, command.id, command.error))
        : command.status === 'failed'
          ? propagateFailure(withStatus(current, command.id, command.status))
          : withStatus(current, command.id, command.status);
    await writeTaskGraph(options.dir, next, options.tasksFile);
    console.log(`Updated ${command.id}.`);
    return;
  }
  const current = requireGraph(graph, options.dir, options.tasksFile);
  const proposal = await readProposal(command.file);
  const next = applyReplan(current, proposal);
  await writeTaskGraph(options.dir, next, options.tasksFile);
  console.log(`Replanned task graph: ${next.tasks.length} tasks.`);
}
