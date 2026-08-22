import { readFile } from 'node:fs/promises';

import type { TaskGraph, TaskStatus } from '../domain/tasks.ts';
import { isTaskStatus, propagateFailure, withError, withResult, withStatus } from '../domain/tasks.ts';
import { applyReplan, selectRunnable, type ReplanProposal } from '../domain/scheduler.ts';
import { readTaskGraph, serializeTaskGraph, taskGraphPath, writeTaskGraph } from '../io/task-store.ts';
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
  options: { readonly dir: string; readonly json: boolean; readonly tasksFile: string },
): string {
  if (!graph) return `No task graph at ${taskGraphPath(options.dir, options.tasksFile)}.`;
  if (options.json) return serializeTaskGraph(graph);
  const lines = formatTaskLines(graph);
  const summary = formatTaskSummary(graph) || '0 tasks';
  if (lines.length === 0) return `\n${summary}`;
  return `${lines.join('\n')}\n\n${summary}`;
}

export async function runTasks(options: {
  readonly dir: string;
  readonly json: boolean;
  readonly tasksFile: string;
  readonly command?: TasksCommand;
}): Promise<void> {
  return runTaskCommand({ ...options, command: options.command ?? { kind: 'status' } });
}

function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireGraph(graph: TaskGraph | null, dir: string, tasksFile: string): TaskGraph {
  if (!graph) throw new Error(`No task graph at ${taskGraphPath(dir, tasksFile)}.`);
  return graph;
}

async function readProposal(file: string): Promise<ReplanProposal> {
  const raw = await readFile(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid replan proposal JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('replan proposal must be an object');
  }
  const proposal = parsed as Record<string, unknown>;
  for (const key of Object.keys(proposal)) {
    if (key !== 'addTasks' && key !== 'addDependencies') throw new Error(`unknown replan proposal key: ${key}`);
  }
  if (proposal.addTasks !== undefined && !Array.isArray(proposal.addTasks)) throw new Error('addTasks must be an array');
  if (proposal.addDependencies !== undefined && !Array.isArray(proposal.addDependencies)) throw new Error('addDependencies must be an array');
  proposal.addTasks?.forEach((task, index) => validateProposalTask(task, index));
  proposal.addDependencies?.forEach((dependency, index) => validateProposalDependency(dependency, index));
  return proposal as ReplanProposal;
}

function validateProposalTask(raw: unknown, index: number): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`replan addTasks[${index}] must be an object`);
  const task = raw as Record<string, unknown>;
  const allowedFields = new Set(['id', 'title', 'description', 'status', 'dependsOn', 'agent', 'files', 'acceptance', 'result', 'error', 'attempts']);
  for (const field of Object.keys(task)) {
    if (!allowedFields.has(field)) throw new Error(`replan addTasks[${index}] unknown key: ${field}`);
  }
  for (const field of ['id', 'title', 'description', 'status', 'dependsOn']) {
    if (!(field in task)) throw new Error(`replan addTasks[${index}] missing ${field}`);
  }
  for (const field of ['id', 'title', 'description']) {
    if (typeof task[field] !== 'string' || task[field] === '') throw new Error(`replan addTasks[${index}].${field} must be a non-empty string`);
  }
  if (typeof task.status !== 'string' || !isTaskStatus(task.status)) throw new Error(`replan addTasks[${index}].status is invalid`);
  if (!Array.isArray(task.dependsOn) || task.dependsOn.some((dependency) => typeof dependency !== 'string')) throw new Error(`replan addTasks[${index}].dependsOn must be an array of strings`);
  for (const field of ['agent', 'result', 'error']) {
    if (task[field] !== undefined && (typeof task[field] !== 'string' || task[field] === '')) throw new Error(`replan addTasks[${index}].${field} must be a non-empty string`);
  }
  for (const field of ['files', 'acceptance']) {
    if (task[field] !== undefined && (!Array.isArray(task[field]) || task[field].some((value) => typeof value !== 'string'))) throw new Error(`replan addTasks[${index}].${field} must be an array of strings`);
  }
  if (task.attempts !== undefined && (typeof task.attempts !== 'number' || !Number.isInteger(task.attempts) || task.attempts < 0)) throw new Error(`replan addTasks[${index}].attempts must be a non-negative integer`);
}

function validateProposalDependency(raw: unknown, index: number): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`replan addDependencies[${index}] must be an object`);
  const dependency = raw as Record<string, unknown>;
  for (const field of Object.keys(dependency)) {
    if (field !== 'id' && field !== 'dependsOn') throw new Error(`replan addDependencies[${index}] unknown key: ${field}`);
  }
  if (typeof dependency.id !== 'string' || dependency.id === '') throw new Error(`replan addDependencies[${index}].id must be a non-empty string`);
  if (typeof dependency.dependsOn !== 'string' || dependency.dependsOn === '') throw new Error(`replan addDependencies[${index}].dependsOn must be a non-empty string`);
}

export function humanReady(graph: TaskGraph): string {
  const ready = selectRunnable(graph);
  if (ready.length === 0) return 'No ready tasks.';
  return ready.map((task) => `${task.id} ${task.title}`).join('\n');
}

export async function runTaskCommand(options: {
  readonly command: TasksCommand;
  readonly dir: string;
  readonly json: boolean;
  readonly tasksFile: string;
}): Promise<void> {
  const graph = await readTaskGraph(options.dir, options.tasksFile);
  const command = options.command;

  if (command.kind === 'status') {
    const output = renderTasks(graph, options);
    if (options.json) process.stdout.write(graph ? output : jsonDocument({ graph: null, path: taskGraphPath(options.dir, options.tasksFile) }));
    else console.log(output);
    return;
  }
  if (command.kind === 'validate') {
    const validGraph = requireGraph(graph, options.dir, options.tasksFile);
    process.stdout.write(options.json ? jsonDocument({ valid: true, tasks: validGraph.tasks.length }) : `Valid task graph: ${validGraph.tasks.length} tasks.\n`);
    return;
  }
  if (command.kind === 'ready') {
    const validGraph = requireGraph(graph, options.dir, options.tasksFile);
    const ready = selectRunnable(validGraph);
    process.stdout.write(options.json ? jsonDocument({ tasks: ready }) : `${humanReady(validGraph)}\n`);
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
    process.stdout.write(options.json ? serializeTaskGraph(next) : `Updated ${command.id}.\n`);
    return;
  }
  const current = requireGraph(graph, options.dir, options.tasksFile);
  const proposal = await readProposal(command.file);
  const next = applyReplan(current, proposal);
  await writeTaskGraph(options.dir, next, options.tasksFile);
  process.stdout.write(options.json ? serializeTaskGraph(next) : `Replanned task graph: ${next.tasks.length} tasks.\n`);
}
