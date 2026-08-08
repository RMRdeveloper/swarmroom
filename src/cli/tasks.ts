import type { TaskGraph, TaskStatus } from '../domain/tasks.ts';
import { readTaskGraph, serializeTaskGraph, taskGraphPath } from '../io/task-store.ts';
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
  options: { readonly dir: string; readonly json: boolean },
): string {
  if (!graph) return `No task graph at ${taskGraphPath(options.dir)}.`;
  if (options.json) return serializeTaskGraph(graph);
  const lines = formatTaskLines(graph);
  const summary = formatTaskSummary(graph) || '0 tasks';
  if (lines.length === 0) return `\n${summary}`;
  return `${lines.join('\n')}\n\n${summary}`;
}

export async function runTasks(options: { readonly dir: string; readonly json: boolean }): Promise<void> {
  const graph = await readTaskGraph(options.dir);
  const output = renderTasks(graph, options);
  if (options.json && graph) {
    process.stdout.write(output);
    return;
  }
  console.log(output);
}
