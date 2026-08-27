import { readFile } from 'node:fs/promises';

import type { TasksCommand } from '../../cli/args.ts';
import * as style from '../../shared/kernel/style.ts';
import {
  normalizeRaw,
  parseBlockRecord,
  splitIntoBlocks,
  splitList as splitListKernel,
  VALID_TASK_KEYS,
} from '../../shared/kernel/tasks-format.ts';
import { applyReplan, selectRunnable, type ReplanProposal } from '../tasks/scheduler.ts';
import { readTaskGraph, taskGraphPath, writeTaskGraph } from '../tasks/task-store.ts';
import type { Task, TaskGraph, TaskStatus } from '../tasks/tasks.ts';
import {
  isTaskStatus,
  propagateFailure,
  withError,
  withResult,
  withStatus,
} from '../tasks/tasks.ts';

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
    .map((s) => `${String(counts[s])} ${s}`)
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

function splitList(value: string, sep: string, field: string, block: number): readonly string[] {
  return splitListKernel(value, sep, field, block, 'replan bloque');
}

async function readProposal(file: string): Promise<ReplanProposal> {
  const raw = await readFile(file, 'utf8');
  const normalized = normalizeRaw(raw);
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error(
      'formato JSON legacy no soportado en propuesta — se esperaba bloques campo: valor',
    );
  }
  if (normalized.trim() === '') return {};

  const blocks = splitIntoBlocks(normalized);

  const addTasks: Task[] = [];
  const addDependencies: { readonly id: string; readonly dependsOn: string }[] = [];

  for (const [bi, block] of blocks.entries()) {
    const n = bi + 1;
    const rec = parseBlockRecord(block.lines, n, block.startLine, 'replan bloque');

    const isDependencyBlock = rec.size === 2 && rec.has('id') && rec.has('dependsOn');

    if (isDependencyBlock) {
      const allowed = new Set(['id', 'dependsOn']);
      for (const k of rec.keys()) {
        if (!allowed.has(k))
          throw new Error(
            `replan bloque ${String(n)}: clave desconocida "${k}" (en bloque de dependencia solo id/dependsOn)`,
          );
      }
      if (!rec.has('id')) throw new Error(`replan bloque ${String(n)}: falta campo "id"`);
      if (!rec.has('dependsOn'))
        throw new Error(`replan bloque ${String(n)}: falta campo "dependsOn"`);
      const idRawDep = rec.get('id');
      const depRaw = rec.get('dependsOn');
      if (idRawDep === undefined || depRaw === undefined)
        throw new Error(`replan bloque ${String(n)}: missing id/dependsOn`);
      const id = idRawDep.trim();
      const dep = depRaw.trim();
      if (id.length === 0)
        throw new Error(`replan bloque ${String(n)}: id debe ser string no vacío`);
      if (dep.length === 0)
        throw new Error(`replan bloque ${String(n)}: dependsOn debe ser string no vacío`);
      if (dep === '-')
        throw new Error(`replan bloque ${String(n)}: dependsOn no puede ser "-" en dependencia`);
      if (dep.includes(','))
        throw new Error(`replan bloque ${String(n)}: dependsOn en dependencia debe ser un solo id`);
      if (dep.includes(';'))
        throw new Error(`replan bloque ${String(n)}: dependsOn en dependencia debe ser un solo id`);
      addDependencies.push({ id, dependsOn: dep });
    } else {
      for (const k of rec.keys()) {
        if (!VALID_TASK_KEYS.has(k))
          throw new Error(`replan bloque ${String(n)}: clave desconocida "${k}"`);
      }
      for (const k of ['id', 'title', 'status', 'dependsOn']) {
        if (!rec.has(k)) throw new Error(`replan bloque ${String(n)}: falta campo "${k}"`);
      }
      const idRaw2 = rec.get('id');
      const titleRaw = rec.get('title');
      const statusRaw2 = rec.get('status');
      const dependsOnRaw2 = rec.get('dependsOn');
      if (
        idRaw2 === undefined ||
        titleRaw === undefined ||
        statusRaw2 === undefined ||
        dependsOnRaw2 === undefined
      )
        throw new Error(`replan bloque ${String(n)}: missing required field`);
      const id = idRaw2.trim();
      const title = titleRaw.trim();
      const statusRaw = statusRaw2.trim();
      const dependsOnRaw = dependsOnRaw2;
      const descriptionRaw = rec.get('description');
      if (id.length === 0)
        throw new Error(`replan bloque ${String(n)}: id debe ser string no vacío`);
      if (title.length === 0)
        throw new Error(`replan bloque ${String(n)}: title debe ser string no vacío`);
      if (!isTaskStatus(statusRaw))
        throw new Error(`replan bloque ${String(n)}: status inválido "${statusRaw}"`);
      const description =
        descriptionRaw !== undefined && descriptionRaw.trim().length > 0
          ? descriptionRaw.trim()
          : title;
      if (description.length === 0)
        throw new Error(`replan bloque ${String(n)}: description debe ser string no vacío`);
      const dependsOn =
        dependsOnRaw.trim() === '-' ? [] : splitList(dependsOnRaw, ',', 'dependsOn', n);
      const agentRaw = rec.get('agent');
      let agent: string | undefined;
      if (agentRaw !== undefined) {
        const v = agentRaw.trim();
        if (v.length === 0)
          throw new Error(`replan bloque ${String(n)}: agent debe ser string no vacío`);
        agent = v;
      }
      let files: readonly string[] | undefined;
      const filesRaw = rec.get('files');
      if (filesRaw !== undefined) {
        const t = filesRaw.trim();
        if (t !== '-') {
          if (t.length === 0)
            throw new Error(`replan bloque ${String(n)}: files no puede ser vacío`);
          files = splitList(filesRaw, ',', 'files', n);
        }
      }
      let acceptance: readonly string[] | undefined;
      const acceptanceRaw = rec.get('acceptance');
      if (acceptanceRaw !== undefined) {
        const t = acceptanceRaw.trim();
        if (t !== '-') {
          if (t.length === 0)
            throw new Error(`replan bloque ${String(n)}: acceptance no puede ser vacío`);
          acceptance = splitList(acceptanceRaw, ';', 'acceptance', n);
        }
      }
      let result: string | undefined;
      const resultRaw = rec.get('result');
      if (resultRaw !== undefined) {
        const v = resultRaw.trim();
        if (v.length === 0)
          throw new Error(`replan bloque ${String(n)}: result debe ser string no vacío`);
        result = v;
      }
      let error: string | undefined;
      const errorRaw = rec.get('error');
      if (errorRaw !== undefined) {
        const v = errorRaw.trim();
        if (v.length === 0)
          throw new Error(`replan bloque ${String(n)}: error debe ser string no vacío`);
        error = v;
      }
      let attempts: number | undefined;
      const attemptsRaw = rec.get('attempts');
      if (attemptsRaw !== undefined) {
        const v = attemptsRaw.trim();
        if (!/^-?\d+$/.test(v))
          throw new Error(`replan bloque ${String(n)}: attempts debe ser entero >=0, got "${v}"`);
        const num = Number(v);
        if (!Number.isInteger(num) || num < 0)
          throw new Error(`replan bloque ${String(n)}: attempts debe ser entero >=0, got "${v}"`);
        attempts = num;
      }

      const task: Task = {
        id,
        title,
        description,
        status: statusRaw,
        dependsOn,
        ...(agent === undefined ? {} : { agent }),
        ...(files === undefined ? {} : { files }),
        ...(acceptance === undefined ? {} : { acceptance }),
        ...(result === undefined ? {} : { result }),
        ...(error === undefined ? {} : { error }),
        ...(attempts === undefined ? {} : { attempts }),
      };
      addTasks.push(task);
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

function nextGraphForSet(
  current: TaskGraph,
  command: Extract<TasksCommand, { kind: 'set' }>,
): TaskGraph {
  if (command.result !== undefined) return withResult(current, command.id, command.result);
  if (command.error !== undefined)
    return propagateFailure(withError(current, command.id, command.error));
  if (command.status === 'failed')
    return propagateFailure(withStatus(current, command.id, command.status));
  return withStatus(current, command.id, command.status);
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
    console.log(`Valid task graph: ${String(validGraph.tasks.length)} tasks.`);
    return;
  }
  if (command.kind === 'ready') {
    const validGraph = requireGraph(graph, options.dir, options.tasksFile);
    console.log(humanReady(validGraph));
    return;
  }
  if (command.kind === 'set') {
    const current = requireGraph(graph, options.dir, options.tasksFile);
    const next = nextGraphForSet(current, command);
    await writeTaskGraph(options.dir, next, options.tasksFile);
    console.log(`Updated ${command.id}.`);
    return;
  }
  const current = requireGraph(graph, options.dir, options.tasksFile);
  const proposal = await readProposal(command.file);
  const next = applyReplan(current, proposal);
  await writeTaskGraph(options.dir, next, options.tasksFile);
  console.log(`Replanned task graph: ${String(next.tasks.length)} tasks.`);
}
