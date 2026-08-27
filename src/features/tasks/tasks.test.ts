import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGraph,
  detectCycle,
  isComplete,
  propagateFailure,
  readyTasks,
  taskById,
  withError,
  withResult,
  withStatus,
  type Task,
} from './tasks.ts';

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.id,
    status: partial.status ?? 'pending',
    dependsOn: partial.dependsOn ?? [],
    ...partial,
  };
}

describe('createGraph', () => {
  it('creates a graph from valid tasks', () => {
    const graph = createGraph([task({ id: 'T1' }), task({ id: 'T2', dependsOn: ['T1'] })]);
    assert.equal(graph.tasks.length, 2);
  });

  it('rejects duplicate ids', () => {
    assert.throws(
      () => createGraph([task({ id: 'T1' }), task({ id: 'T1' })]),
      /duplicate task id: T1/,
    );
  });

  it('rejects a missing dependency', () => {
    assert.throws(
      () => createGraph([task({ id: 'T1', dependsOn: ['T9'] })]),
      /task T1 depends on missing id: T9/,
    );
  });

  it('rejects a cycle', () => {
    assert.throws(
      () =>
        createGraph([task({ id: 'T1', dependsOn: ['T2'] }), task({ id: 'T2', dependsOn: ['T1'] })]),
      /cycle in task graph/,
    );
  });
});

describe('detectCycle', () => {
  it('returns null when acyclic', () => {
    assert.equal(detectCycle([task({ id: 'T1' }), task({ id: 'T2', dependsOn: ['T1'] })]), null);
  });

  it('returns the cycle path', () => {
    const cycle = detectCycle([
      task({ id: 'T1', dependsOn: ['T3'] }),
      task({ id: 'T2', dependsOn: ['T1'] }),
      task({ id: 'T3', dependsOn: ['T2'] }),
    ]);
    assert.ok(cycle);
    assert.ok(cycle.length >= 3);
  });
});

describe('readyTasks', () => {
  it('returns pending and ready tasks with completed deps, in graph order', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'completed' }),
      task({ id: 'T2', status: 'pending', dependsOn: ['T1'] }),
      task({ id: 'T3', status: 'ready', dependsOn: ['T1'] }),
      task({ id: 'T4', status: 'pending', dependsOn: ['T2'] }),
      task({ id: 'T5', status: 'running' }),
    ]);
    assert.deepEqual(
      readyTasks(graph).map((t) => t.id),
      ['T2', 'T3'],
    );
  });

  it('returns nothing from an empty graph', () => {
    assert.deepEqual(readyTasks(createGraph([])), []);
  });

  it('unlocks dependents after completion', () => {
    const before = createGraph([
      task({ id: 'T1', status: 'running' }),
      task({ id: 'T2', status: 'pending', dependsOn: ['T1'] }),
    ]);
    assert.deepEqual(readyTasks(before), []);
    const after = withResult(before, 'T1', 'done');
    assert.deepEqual(
      readyTasks(after).map((t) => t.id),
      ['T2'],
    );
  });
});

describe('withStatus / withResult / withError', () => {
  it('updates status without mutating the original graph', () => {
    const graph = createGraph([task({ id: 'T1', status: 'pending' })]);
    const next = withStatus(graph, 'T1', 'running');
    assert.equal(taskById(graph, 'T1').status, 'pending');
    assert.equal(taskById(next, 'T1').status, 'running');
  });

  it('fails fast on unknown id', () => {
    const graph = createGraph([task({ id: 'T1' })]);
    assert.throws(() => withStatus(graph, 'T9', 'running'), /unknown task id: T9/);
    assert.throws(() => taskById(graph, 'T9'), /unknown task id: T9/);
  });

  it('marks completed with result and optional files', () => {
    const graph = createGraph([task({ id: 'T1', status: 'running', files: ['a.ts'] })]);
    const done = withResult(graph, 'T1', 'ok', ['b.ts']);
    const t = taskById(done, 'T1');
    assert.equal(t.status, 'completed');
    assert.equal(t.result, 'ok');
    assert.deepEqual(t.files, ['b.ts']);
    assert.equal(t.error, undefined);
  });

  it('marks failed and increments attempts', () => {
    const graph = createGraph([task({ id: 'T1', status: 'running' })]);
    const failed = withError(graph, 'T1', 'boom');
    const t = taskById(failed, 'T1');
    assert.equal(t.status, 'failed');
    assert.equal(t.error, 'boom');
    assert.equal(t.attempts, 1);
    assert.equal(taskById(withError(failed, 'T1', 'again'), 'T1').attempts, 2);
  });
});

describe('propagateFailure', () => {
  it('blocks transitive dependents of a failed task', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'failed' }),
      task({ id: 'T2', status: 'pending', dependsOn: ['T1'] }),
      task({ id: 'T3', status: 'pending', dependsOn: ['T2'] }),
      task({ id: 'T4', status: 'pending' }),
    ]);
    const next = propagateFailure(graph);
    assert.equal(taskById(next, 'T2').status, 'blocked');
    assert.equal(taskById(next, 'T3').status, 'blocked');
    assert.equal(taskById(next, 'T4').status, 'pending');
    assert.equal(taskById(next, 'T1').status, 'failed');
  });

  it('leaves a graph with no failures unchanged', () => {
    const graph = createGraph([task({ id: 'T1', status: 'pending' })]);
    assert.equal(propagateFailure(graph), graph);
  });
});

describe('isComplete', () => {
  it('is true for an empty graph', () => {
    assert.equal(isComplete(createGraph([])), true);
  });

  it('is true when every task is completed, failed, or blocked', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'completed' }),
      task({ id: 'T2', status: 'failed' }),
      task({ id: 'T3', status: 'blocked', dependsOn: ['T2'] }),
    ]);
    assert.equal(isComplete(graph), true);
  });

  it('is false while any task is pending, ready, or running', () => {
    assert.equal(isComplete(createGraph([task({ id: 'T1', status: 'pending' })])), false);
    assert.equal(isComplete(createGraph([task({ id: 'T1', status: 'ready' })])), false);
    assert.equal(isComplete(createGraph([task({ id: 'T1', status: 'running' })])), false);
  });
});
