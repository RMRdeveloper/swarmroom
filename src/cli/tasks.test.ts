import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createGraph, type Task } from '../domain/tasks.ts';
import { taskGraphPath, writeTaskGraph } from '../io/task-store.ts';
import { formatTaskLines, formatTaskSummary, glyphFor, humanReady, renderTasks, runTaskCommand } from './tasks.ts';

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.id,
    status: partial.status ?? 'pending',
    dependsOn: partial.dependsOn ?? [],
    ...partial,
  };
}

describe('glyphFor', () => {
  it('maps statuses to compact glyphs', () => {
    assert.equal(glyphFor('completed'), '✓');
    assert.equal(glyphFor('running'), '●');
    assert.equal(glyphFor('failed'), '✗');
    assert.equal(glyphFor('blocked'), '○');
    assert.equal(glyphFor('pending'), '○');
    assert.equal(glyphFor('ready'), '○');
  });
});

describe('formatTaskLines', () => {
  it('includes glyph, id, and title', () => {
    const graph = createGraph([
      task({ id: 'T1', title: 'Implement OAuth backend', status: 'completed' }),
      task({ id: 'T2', title: 'Implement OAuth UI', status: 'completed' }),
      task({ id: 'T3', title: 'Integration tests', status: 'running' }),
      task({ id: 'T4', title: 'Final verification', status: 'pending' }),
    ]);
    const lines = formatTaskLines(graph);
    assert.equal(lines.length, 4);
    assert.match(lines[0]!, /✓ T1 Implement OAuth backend/);
    assert.match(lines[1]!, /✓ T2 Implement OAuth UI/);
    assert.match(lines[2]!, /● T3 Integration tests/);
    assert.match(lines[3]!, /○ T4 Final verification/);
  });
});

describe('formatTaskSummary', () => {
  it('includes only non-zero counts in status order', () => {
    const graph = createGraph([
      task({ id: 'T1', status: 'completed' }),
      task({ id: 'T2', status: 'completed' }),
      task({ id: 'T3', status: 'running' }),
      task({ id: 'T4', status: 'pending' }),
    ]);
    assert.equal(formatTaskSummary(graph), '2 completed · 1 running · 1 pending');
  });

  it('returns an empty string for an empty graph', () => {
    assert.equal(formatTaskSummary(createGraph([])), '');
  });
});

describe('renderTasks', () => {
  it('explains a missing graph', () => {
    assert.equal(renderTasks(null, { dir: '/tmp/proj', json: false, tasksFile: 'run.json' }), `No task graph at ${taskGraphPath('/tmp/proj', 'run.json')}.`);
  });

  it('dumps JSON when requested', () => {
    const graph = createGraph([task({ id: 'T1', status: 'pending' })]);
    const dumped = renderTasks(graph, { dir: '/tmp/proj', json: true, tasksFile: 'run.json' });
    assert.match(dumped, /"id": "T1"/);
    assert.match(dumped, /"status": "pending"/);
  });

  it('renders an empty graph as zero tasks', () => {
    assert.equal(renderTasks(createGraph([]), { dir: '/tmp/proj', json: false, tasksFile: 'run.json' }), '\n0 tasks');
  });

  it('renders only safely runnable tasks', () => {
    const graph = createGraph([
      task({ id: 'T1', agent: 'sw-implementer', files: ['shared.ts'] }),
      task({ id: 'T2', agent: 'sw-fixer', files: ['shared.ts'] }),
    ]);
    assert.equal(humanReady(graph), 'T1 T1');
  });
});

describe('runTaskCommand', () => {
  it('sets status and persists the domain transformation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.json');
    await runTaskCommand({ dir, json: true, tasksFile: 'run.json', command: { kind: 'set', id: 'T1', status: 'running' } });
    const saved = JSON.parse(await readFile(taskGraphPath(dir, 'run.json'), 'utf8')) as { tasks: { status: string }[] };
    assert.equal(saved.tasks[0]?.status, 'running');
  });

  it('propagates a plain failed status to its dependents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([
      task({ id: 'T1', status: 'running' }),
      task({ id: 'T2', dependsOn: ['T1'] }),
    ]), 'run.json');
    await runTaskCommand({ dir, json: true, tasksFile: 'run.json', command: { kind: 'set', id: 'T1', status: 'failed' } });
    const saved = JSON.parse(await readFile(taskGraphPath(dir, 'run.json'), 'utf8')) as { tasks: { id: string; status: string }[] };
    assert.equal(saved.tasks.find((savedTask) => savedTask.id === 'T2')?.status, 'blocked');
  });

  it('replans only after applying a valid proposal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', status: 'completed' })]), 'run.json');
    const proposalPath = join(dir, 'proposal.json');
    await writeFile(proposalPath, JSON.stringify({
      addTasks: [task({ id: 'T2', dependsOn: ['T1'] })],
    }));
    await runTaskCommand({ dir, json: true, tasksFile: 'run.json', command: { kind: 'replan', file: proposalPath } });
    const saved = JSON.parse(await readFile(taskGraphPath(dir, 'run.json'), 'utf8')) as { tasks: { id: string }[] };
    assert.deepEqual(saved.tasks.map((savedTask) => savedTask.id), ['T1', 'T2']);
  });

  it('does not write when a mutation fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.json');
    await assert.rejects(
      runTaskCommand({ dir, json: true, tasksFile: 'run.json', command: { kind: 'set', id: 'missing', status: 'failed' } }),
      /unknown task id: missing/,
    );
    const saved = JSON.parse(await readFile(taskGraphPath(dir, 'run.json'), 'utf8')) as { tasks: { status: string }[] };
    assert.equal(saved.tasks[0]?.status, 'pending');
  });

  it('rejects malformed replan task entries with proposal context', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.json');
    const proposalPath = join(dir, 'proposal.json');
    await writeFile(proposalPath, JSON.stringify({ addTasks: [{ id: 'T2' }] }));
    await assert.rejects(
      runTaskCommand({ dir, json: true, tasksFile: 'run.json', command: { kind: 'replan', file: proposalPath } }),
      /replan addTasks\[0\] missing title/,
    );
  });

  it('isolates two tasks files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', title: 'A' })]), 'a.json');
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', title: 'B' })]), 'b.json');
    await runTaskCommand({ dir, json: true, tasksFile: 'a.json', command: { kind: 'set', id: 'T1', status: 'completed' } });
    const a = JSON.parse(await readFile(taskGraphPath(dir, 'a.json'), 'utf8')) as { tasks: { status: string }[] };
    const b = JSON.parse(await readFile(taskGraphPath(dir, 'b.json'), 'utf8')) as { tasks: { status: string }[] };
    assert.equal(a.tasks[0]?.status, 'completed');
    assert.equal(b.tasks[0]?.status, 'pending');
  });
});
