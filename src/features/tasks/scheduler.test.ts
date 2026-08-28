import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_ATTEMPTS, applyReplan, canRetry, isWriter, selectRunnable } from './scheduler.ts';
import {
  createGraph,
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

describe('isWriter / canRetry', () => {
  it('treats implementer and fixer as writers', () => {
    assert.equal(isWriter('sw-implementer'), true);
    assert.equal(isWriter('sw-fixer'), true);
    assert.equal(isWriter('sw-verifier'), false);
    assert.equal(isWriter(undefined), false);
  });

  it('allows retry until MAX_ATTEMPTS', () => {
    assert.equal(canRetry(task({ id: 'T1' })), true);
    assert.equal(canRetry(task({ id: 'T1', attempts: MAX_ATTEMPTS - 1 })), true);
    assert.equal(canRetry(task({ id: 'T1', attempts: MAX_ATTEMPTS })), false);
  });
});

describe('selectRunnable', () => {
  it('runs sequentially when deps are not complete', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', agent: 'sw-implementer', files: ['b.ts'], dependsOn: ['T1'] }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1'],
    );
    const after = withResult(graph, 'T1', 'done');
    assert.deepEqual(
      selectRunnable(after).map((t) => t.id),
      ['T2'],
    );
  });

  it('runs writers in parallel when files are disjoint', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', agent: 'sw-implementer', files: ['b.ts'] }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T2'],
    );
  });

  it('blocks parallel writers when files overlap', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['a.ts', 'c.ts'] }),
      task({ id: 'T2', agent: 'sw-fixer', files: ['c.ts'] }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1'],
    );
  });

  it('keeps later disjoint writers when an earlier writer conflicts', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', agent: 'sw-fixer', files: ['a.ts'] }),
      task({ id: 'T3', agent: 'sw-implementer', files: ['b.ts'] }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T3'],
    );
  });

  it('runs a writer without files alone among writers', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer' }),
      task({ id: 'T2', agent: 'sw-implementer', files: ['b.ts'] }),
      task({ id: 'T3', agent: 'sw-verifier' }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T3'],
    );
  });

  it('does not start a writer that conflicts with a running writer', () => {
    const overlap = createGraph([
      task({ id: 'T1', status: 'running', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T3', agent: 'sw-implementer', files: ['b.ts'] }),
    ]);
    assert.deepEqual(
      selectRunnable(overlap).map((t) => t.id),
      ['T3'],
    );

    const fileless = createGraph([
      task({ id: 'T1', status: 'running', agent: 'sw-implementer' }),
      task({ id: 'T2', agent: 'sw-implementer', files: ['b.ts'] }),
      task({ id: 'T3', agent: 'sw-verifier' }),
    ]);
    assert.deepEqual(
      selectRunnable(fileless).map((t) => t.id),
      ['T3'],
    );
  });

  it('lets non-writers run together', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-code-reviewer' }),
      task({ id: 'T2', agent: 'sw-verifier' }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T2'],
    );
  });

  it('runs non-writers safely alongside a writer', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', agent: 'sw-code-reviewer', files: ['a.ts'] }),
      task({ id: 'T3', agent: 'sw-verifier' }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T2', 'T3'],
    );
  });
});

describe('applyReplan', () => {
  it('adds a task and dependency then recalculates ready', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'completed', agent: 'sw-implementer' }),
      task({ id: 'T2', status: 'pending', agent: 'sw-implementer', dependsOn: ['T1'] }),
    ]);
    const next = applyReplan(graph, {
      addTasks: [
        task({
          id: 'T3',
          title: 'Session management',
          description: 'Add sessions before OAuth',
          agent: 'sw-implementer',
        }),
      ],
      addDependencies: [{ id: 'T2', dependsOn: 'T3' }],
    });
    assert.equal(taskById(next, 'T2').dependsOn.includes('T3'), true);
    assert.deepEqual(
      readyTasks(next).map((t) => t.id),
      ['T3'],
    );
  });

  it('rejects a cycle', () => {
    const graph = createGraph([
      task({ id: 'T1', dependsOn: [] }),
      task({ id: 'T2', dependsOn: ['T1'] }),
    ]);
    assert.throws(
      () => applyReplan(graph, { addDependencies: [{ id: 'T1', dependsOn: 'T2' }] }),
      /cycle in task graph/,
    );
  });

  it('rejects replacing an existing task', () => {
    const graph = createGraph([task({ id: 'T1', status: 'completed', result: 'done' })]);
    assert.throws(
      () =>
        applyReplan(graph, {
          addTasks: [task({ id: 'T1', status: 'pending' })],
        }),
      /replan cannot replace existing task: T1/,
    );
    assert.equal(taskById(graph, 'T1').status, 'completed');
  });

  it('rejects a dependency on a missing id', () => {
    const graph = createGraph([task({ id: 'T1' })]);
    assert.throws(
      () => applyReplan(graph, { addDependencies: [{ id: 'T1', dependsOn: 'T9' }] }),
      /replan dependency source missing: T9/,
    );
  });
});

describe('failure propagation and retry', () => {
  it('blocks dependents after failure', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'running', agent: 'sw-implementer' }),
      task({ id: 'T2', status: 'pending', dependsOn: ['T1'] }),
    ]);
    const failed = propagateFailure(withError(graph, 'T1', 'boom'));
    assert.equal(taskById(failed, 'T2').status, 'blocked');
    assert.equal(isComplete(failed), true);
  });
});

describe('fake pipeline run', () => {
  it('walks implement → review → verify → completed', () => {
    let graph = createGraph([
      task({
        id: 'T1',
        title: 'Implement',
        agent: 'sw-implementer',
        files: ['src/auth.ts'],
      }),
      task({
        id: 'T2',
        title: 'Review',
        agent: 'sw-code-reviewer',
        dependsOn: ['T1'],
      }),
      task({
        id: 'T3',
        title: 'Verify',
        agent: 'sw-verifier',
        dependsOn: ['T2'],
      }),
    ]);

    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1'],
    );
    graph = withStatus(graph, 'T1', 'running');
    graph = withResult(graph, 'T1', 'implemented', ['src/auth.ts']);

    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T2'],
    );
    graph = withStatus(graph, 'T2', 'running');
    graph = withResult(graph, 'T2', 'No findings');

    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T3'],
    );
    graph = withStatus(graph, 'T3', 'running');
    graph = withResult(graph, 'T3', 'verified');

    assert.equal(isComplete(graph), true);
    assert.equal(taskById(graph, 'T1').status, 'completed');
    assert.equal(taskById(graph, 'T2').status, 'completed');
    assert.equal(taskById(graph, 'T3').status, 'completed');
  });
});

describe('selectRunnable fileless edge', () => {
  it('dos writers fileless no corren en paralelo (solo el primero)', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer' }),
      task({ id: 'T2', agent: 'sw-fixer' }),
      task({ id: 'T3', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T4', agent: 'sw-verifier' }),
    ]);
    assert.deepEqual(
      selectRunnable(graph).map((t) => t.id),
      ['T1', 'T4'],
    );
  });
});
