import { createGraph, readyTasks, type Task, type TaskGraph } from './tasks.ts';

/**
 * Writers own file mutations; only implementer and fixer are writers.
 * Readers (reviewer/verifier/planner/researcher) never conflict with writers on files.
 * Keep in sync with pipeline agents — TODO #001 -- consider deriving WRITER_AGENTS from pipeline.ts if roles become configurable.
 */
export const WRITER_AGENTS = ['sw-implementer', 'sw-fixer'] as const;

/**
 * Max retry attempts per task. Not used in `selectRunnable` (which only filters by ready/running),
 * but used in `canRetry` to decide if a failed task may be retried by the orchestrator.
 */
export const MAX_ATTEMPTS = 2;

const WRITER_SET: ReadonlySet<(typeof WRITER_AGENTS)[number]> = new Set(WRITER_AGENTS);

export interface ReplanProposal {
  readonly addTasks?: readonly Task[];
  readonly addDependencies?: readonly { readonly id: string; readonly dependsOn: string }[];
}

/**
 * True only for writer agents (`sw-implementer` | `sw-fixer`).
 * All other agents are readers and never participate in writer file-conflict checks.
 */
export function isWriter(agent: string | undefined): agent is (typeof WRITER_AGENTS)[number] {
  if (agent === undefined) return false;
  return (WRITER_SET as ReadonlySet<string>).has(agent);
}

/**
 * Whether a task may be retried — attempts < MAX_ATTEMPTS.
 * Invariant: scheduler never retries automatically; caller decides via `canRetry`.
 */
export function canRetry(task: Task): boolean {
  return (task.attempts ?? 0) < MAX_ATTEMPTS;
}

function filesOverlap(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((f) => set.has(f));
}

/**
 * Writer conflict rule: a writer with no `files` is assumed to touch the whole repo,
 * so `files === undefined` or `files.length === 0` always conflicts with any other writer.
 * This is fail-closed: unknown scope => no parallel execution. Non-writers never conflict.
 * Property: fileless writers never run in parallel (enforced by this function).
 */
function writerConflicts(candidate: Task, selected: readonly Task[]): boolean {
  if (!isWriter(candidate.agent)) return false;
  const selectedWriters = selected.filter((t) => isWriter(t.agent));
  if (selectedWriters.length === 0) return false;
  if (!candidate.files || candidate.files.length === 0) return true;
  for (const other of selectedWriters) {
    if (!other.files || other.files.length === 0) return true;
    if (filesOverlap(candidate.files, other.files)) return true;
  }
  return false;
}

/**
 * Safe parallel set from ready tasks, in graph.tasks order.
 * Writers with overlapping files or with undefined files never run together; readers always parallel.
 * Occupying writers (`running` + writer) also block conflicting ready writers.
 * MAX_ATTEMPTS is not consulted here — scheduling is ready-state only; retry gate is `canRetry`.
 */
export function selectRunnable(graph: TaskGraph): readonly Task[] {
  const occupying = graph.tasks.filter((t) => t.status === 'running' && isWriter(t.agent));
  const selected: Task[] = [];
  for (const task of readyTasks(graph)) {
    if (writerConflicts(task, [...occupying, ...selected])) continue;
    selected.push(task);
  }
  return selected;
}

function appendDependency(task: Task, dep: string): Task {
  if (task.dependsOn.includes(dep)) return task;
  return { ...task, dependsOn: [...task.dependsOn, dep] };
}

/** Apply orchestrator-only replanning. Rejects replacing existing tasks. */
export function applyReplan(graph: TaskGraph, proposal: ReplanProposal): TaskGraph {
  const added = proposal.addTasks ?? [];
  const extraDeps = proposal.addDependencies ?? [];
  const existingIds = new Set(graph.tasks.map((t) => t.id));

  for (const next of added) {
    if (existingIds.has(next.id)) {
      throw new Error(`replan cannot replace existing task: ${next.id}`);
    }
  }

  const byId = new Map<string, Task>();
  for (const task of graph.tasks) byId.set(task.id, task);
  for (const next of added) byId.set(next.id, next);

  for (const edge of extraDeps) {
    const target = byId.get(edge.id);
    if (!target) throw new Error(`replan dependency target missing: ${edge.id}`);
    if (!byId.has(edge.dependsOn)) {
      throw new Error(`replan dependency source missing: ${edge.dependsOn}`);
    }
    byId.set(edge.id, appendDependency(target, edge.dependsOn));
  }

  return createGraph([...byId.values()]);
}
