export {
  TASK_STATUSES,
  isTaskStatus,
  type Task,
  type TaskStatus,
} from '../../shared/kernel/tasks-cli-types.ts';
import type { Task, TaskStatus } from '../../shared/kernel/tasks-cli-types.ts';

export interface TaskGraph {
  readonly tasks: readonly Task[];
}

const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set(['pending', 'ready', 'running']);

/** DFS; returns the cycle path (including the repeated start) or null. Fails fast on missing dep to align with createGraph. */
export function detectCycle(tasks: readonly Task[]): readonly string[] | null {
  const byId = new Map<string, Task>();
  for (const task of tasks) byId.set(task.id, task);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function walk(id: string): readonly string[] | null {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    visiting.add(id);
    stack.push(id);
    const task = byId.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        if (!byId.has(dep)) {
          throw new Error(`task ${task.id} depends on missing id: ${dep}`);
        }
        const cycle = walk(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const task of tasks) {
    const cycle = walk(task.id);
    if (cycle) return cycle;
  }
  return null;
}

function assertUniqueIds(tasks: readonly Task[]): void {
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) {
      throw new Error(`duplicate task id: ${task.id}`);
    }
    seen.add(task.id);
  }
}

function assertDependenciesExist(tasks: readonly Task[]): void {
  const ids = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`task ${task.id} depends on missing id: ${dep}`);
      }
    }
  }
}

/** Fail fast on duplicate id, missing dependency, or cycle. */
export function createGraph(tasks: readonly Task[]): TaskGraph {
  assertUniqueIds(tasks);
  assertDependenciesExist(tasks);
  const cycle = detectCycle(tasks);
  if (cycle) {
    throw new Error(`cycle in task graph: ${cycle.join(' -> ')}`);
  }
  return { tasks };
}

export function taskById(graph: TaskGraph, id: string): Task {
  const task = graph.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`unknown task id: ${id}`);
  return task;
}

function replaceTask(graph: TaskGraph, next: Task): TaskGraph {
  return {
    tasks: graph.tasks.map((t) => (t.id === next.id ? next : t)),
  };
}

export function readyTasks(graph: TaskGraph): readonly Task[] {
  const propagated = propagateFailure(graph);
  const byId = new Map(propagated.tasks.map((t) => [t.id, t]));
  return propagated.tasks.filter((task) => {
    if (task.status !== 'pending' && task.status !== 'ready') return false;
    return task.dependsOn.every((depId) => byId.get(depId)?.status === 'completed');
  });
}

export function withStatus(graph: TaskGraph, id: string, status: TaskStatus): TaskGraph {
  const task = taskById(graph, id);
  return replaceTask(graph, { ...task, status });
}

export function withResult(
  graph: TaskGraph,
  id: string,
  result: string,
  files?: readonly string[],
): TaskGraph {
  const task = taskById(graph, id);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip error on completion
  const { error: _omit, ...rest } = task;
  return replaceTask(graph, {
    ...rest,
    status: 'completed',
    result,
    ...(files === undefined ? {} : { files }),
  });
}

export function withError(graph: TaskGraph, id: string, error: string): TaskGraph {
  const task = taskById(graph, id);
  return replaceTask(graph, {
    ...task,
    status: 'failed',
    error,
    attempts: (task.attempts ?? 0) + 1,
  });
}

/** Any task that transitively depends on a failed task becomes blocked.
 *  Preserves completed/failed nodes themselves but propagates through them
 *  (fail-closed transitive semantics).
 */
export function propagateFailure(graph: TaskGraph): TaskGraph {
  const failed = new Set(graph.tasks.filter((t) => t.status === 'failed').map((t) => t.id));
  if (failed.size === 0) return graph;

  const dependents = new Map<string, string[]>();
  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(task.id);
      dependents.set(dep, list);
    }
  }

  const blocked = new Set<string>();
  const queue = [...failed];
  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    if (id === undefined) continue;
    for (const child of dependents.get(id) ?? []) {
      if (failed.has(child) || blocked.has(child)) continue;
      blocked.add(child);
      queue.push(child);
    }
  }

  if (blocked.size === 0) return graph;
  return {
    tasks: graph.tasks.map((task) => {
      if (!blocked.has(task.id)) return task;
      if (task.status === 'failed' || task.status === 'completed') return task;
      return { ...task, status: 'blocked' };
    }),
  };
}

/** No tasks in pending|ready|running. Empty graph is complete. Implicitly propagates failure to avoid deadlock. */
export function isComplete(graph: TaskGraph): boolean {
  const propagated = propagateFailure(graph);
  return propagated.tasks.every((t) => !OPEN_STATUSES.has(t.status));
}
