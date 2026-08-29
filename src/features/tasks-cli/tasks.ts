import { readFile } from 'node:fs/promises';

import * as style from '../../shared/kernel/style.ts';
import type { TasksCommand } from '../../shared/kernel/tasks-cli-types.ts';
import {
  assertTasksFileSafe,
  normalizeRaw,
  parseBlockRecord,
  recordToTask,
  splitIntoBlocks,
} from '../../shared/kernel/tasks-format.ts';
import { applyReplan, selectRunnable, type ReplanProposal } from '../tasks/scheduler.ts';
import { readTaskGraph, taskGraphPath, writeTaskGraph } from '../tasks/task-store.ts';
import type { Task, TaskGraph, TaskStatus } from '../tasks/tasks.ts';
import { propagateFailure, withError, withResult, withStatus } from '../tasks/tasks.ts';

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

async function readProposal(file: string): Promise<ReplanProposal> {
  assertTasksFileSafe(file);
  const raw = await readFile(file, 'utf8');
  const normalized = normalizeRaw(raw);
  const trimmedStart = normalized.trimStart();
  if (trimmedStart.startsWith('{') || trimmedStart.startsWith('[')) {
    throw new Error(
      'legacy JSON format not supported in proposal — expected blocks of field: value',
    );
  }
  if (normalized.trim() === '') return {};

  const blocks = splitIntoBlocks(normalized);

  const addTasks: Task[] = [];
  const addDependencies: { readonly id: string; readonly dependsOn: string }[] = [];

  for (const [bi, block] of blocks.entries()) {
    const n = bi + 1;
    const rec = parseBlockRecord(block.lines, n, block.startLine, 'replan block');

    const isDependencyBlock = rec.size === 2 && rec.has('id') && rec.has('dependsOn');

    if (isDependencyBlock) {
      const allowed = new Set(['id', 'dependsOn']);
      for (const k of rec.keys()) {
        if (!allowed.has(k))
          throw new Error(
            `replan block ${String(n)}: unknown key "${k}" (in dependency block only id/dependsOn)`,
          );
      }
      if (!rec.has('id')) throw new Error(`replan block ${String(n)}: missing field "id"`);
      if (!rec.has('dependsOn'))
        throw new Error(`replan block ${String(n)}: missing field "dependsOn"`);
      const idRawDep = rec.get('id');
      const depRaw = rec.get('dependsOn');
      if (idRawDep === undefined || depRaw === undefined)
        throw new Error(`replan block ${String(n)}: missing id/dependsOn`);
      const id = idRawDep.trim();
      const dep = depRaw.trim();
      if (id.length === 0)
        throw new Error(`replan block ${String(n)}: id must be a non-empty string`);
      if (dep.length === 0)
        throw new Error(`replan block ${String(n)}: dependsOn must be a non-empty string`);
      if (dep === '-')
        throw new Error(`replan block ${String(n)}: dependsOn cannot be "-" in dependency`);
      if (dep.includes(','))
        throw new Error(`replan block ${String(n)}: dependsOn in dependency must be a single id`);
      if (dep.includes(';'))
        throw new Error(`replan block ${String(n)}: dependsOn in dependency must be a single id`);
      addDependencies.push({ id, dependsOn: dep });
    } else {
      const task = recordToTask(rec, n, 'replan block');
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
