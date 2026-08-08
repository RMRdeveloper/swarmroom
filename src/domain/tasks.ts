export const TASK_STATUSES = ['pending', 'ready', 'running', 'blocked', 'completed', 'failed'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dependsOn: readonly string[];
  readonly agent?: string;
  readonly files?: readonly string[];
  readonly acceptance?: readonly string[];
  readonly result?: string;
  readonly error?: string;
  readonly attempts?: number;
}

export interface TaskGraph {
  readonly tasks: readonly Task[];
}

const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set(['pending', 'ready', 'running']);

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/** DFS; returns the cycle path (including the repeated start) or null. */
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

/** Tasks with status pending or ready whose deps are all completed. Graph order. */
export function readyTasks(graph: TaskGraph): readonly Task[] {
  const byId = new Map(graph.tasks.map((t) => [t.id, t]));
  return graph.tasks.filter((task) => {
    if (task.status !== 'pending' && task.status !== 'ready') return false;
    return task.dependsOn.every((depId) => byId.get(depId)?.status === 'completed');
  });
}

export function withStatus(graph: TaskGraph, id: string, status: TaskStatus): TaskGraph {
  const task = taskById(graph, id);
  return replaceTask(graph, { ...task, status });
}

export function withResult(graph: TaskGraph, id: string, result: string, files?: readonly string[]): TaskGraph {
  const task = taskById(graph, id);
  const { error: _error, ...rest } = task;
  return replaceTask(graph, {
    ...rest,
    status: 'completed',
    result,
    ...(files !== undefined ? { files } : {}),
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

/** Any task that transitively depends on a failed task becomes blocked. */
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
  while (queue.length > 0) {
    const id = queue.shift()!;
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

/** No tasks in pending|ready|running. Empty graph is complete. */
export function isComplete(graph: TaskGraph): boolean {
  return graph.tasks.every((t) => !OPEN_STATUSES.has(t.status));
}
