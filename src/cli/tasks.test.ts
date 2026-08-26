import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createGraph, type Task } from '../domain/tasks.ts';
import { parseTaskGraph, taskGraphPath, writeTaskGraph } from '../io/task-store.ts';
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

function taskBlocks(tasks: readonly Task[]): string {
  // helper to create replan proposal blocks (reuse serialize logic manually)
  return tasks
    .map((t) => {
      const lines = [
        `id: ${t.id}`,
        `status: ${t.status}`,
        `dependsOn: ${t.dependsOn.length === 0 ? '-' : t.dependsOn.join(', ')}`,
        `title: ${t.title}`,
        `description: ${t.description}`,
      ];
      if (t.agent) lines.splice(3, 0, `agent: ${t.agent}`);
      if (t.files) lines.push(`files: ${t.files.join(', ')}`);
      if (t.acceptance) lines.push(`acceptance: ${t.acceptance.join('; ')}`);
      if (t.result) lines.push(`result: ${t.result}`);
      if (t.error) lines.push(`error: ${t.error}`);
      if (t.attempts !== undefined) lines.push(`attempts: ${t.attempts}`);
      return lines.join('\n');
    })
    .join('\n\n') + '\n';
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
    assert.equal(renderTasks(null, { dir: '/tmp/proj', tasksFile: 'run.tasks' }), `No task graph at ${taskGraphPath('/tmp/proj', 'run.tasks')}.`);
  });

  it('renders an empty graph as zero tasks', () => {
    assert.equal(renderTasks(createGraph([]), { dir: '/tmp/proj', tasksFile: 'run.tasks' }), '\n0 tasks');
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
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.tasks');
    await runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'set', id: 'T1', status: 'running' } });
    const saved = parseTaskGraph(await readFile(taskGraphPath(dir, 'run.tasks'), 'utf8'));
    assert.equal(saved.tasks[0]?.status, 'running');
  });

  it('propagates a plain failed status to its dependents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([
      task({ id: 'T1', status: 'running' }),
      task({ id: 'T2', dependsOn: ['T1'] }),
    ]), 'run.tasks');
    await runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'set', id: 'T1', status: 'failed' } });
    const saved = parseTaskGraph(await readFile(taskGraphPath(dir, 'run.tasks'), 'utf8'));
    assert.equal(saved.tasks.find((savedTask) => savedTask.id === 'T2')?.status, 'blocked');
  });

  it('replans only after applying a valid proposal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', status: 'completed' })]), 'run.tasks');
    const proposalPath = join(dir, 'proposal.tasks');
    await writeFile(proposalPath, taskBlocks([task({ id: 'T2', dependsOn: ['T1'] })]));
    await runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'replan', file: proposalPath } });
    const saved = parseTaskGraph(await readFile(taskGraphPath(dir, 'run.tasks'), 'utf8'));
    assert.deepEqual(saved.tasks.map((savedTask) => savedTask.id), ['T1', 'T2']);
  });

  it('does not write when a mutation fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.tasks');
    await assert.rejects(
      runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'set', id: 'missing', status: 'failed' } }),
      /unknown task id: missing/,
    );
    const saved = parseTaskGraph(await readFile(taskGraphPath(dir, 'run.tasks'), 'utf8'));
    assert.equal(saved.tasks[0]?.status, 'pending');
  });

  it('rejects malformed replan task entries with proposal context', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' })]), 'run.tasks');
    const proposalPath = join(dir, 'proposal.tasks');
    await writeFile(proposalPath, 'id: T2\nstatus: pending\ndependsOn: -\n');
    await assert.rejects(
      runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'replan', file: proposalPath } }),
      /replan bloque 1: falta campo "title"/,
    );
  });

  it('isolates two tasks files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', title: 'A' })]), 'a.tasks');
    await writeTaskGraph(dir, createGraph([task({ id: 'T1', title: 'B' })]), 'b.tasks');
    await runTaskCommand({ dir, tasksFile: 'a.tasks', command: { kind: 'set', id: 'T1', status: 'completed' } });
    const a = parseTaskGraph(await readFile(taskGraphPath(dir, 'a.tasks'), 'utf8'));
    const b = parseTaskGraph(await readFile(taskGraphPath(dir, 'b.tasks'), 'utf8'));
    assert.equal(a.tasks[0]?.status, 'completed');
    assert.equal(b.tasks[0]?.status, 'pending');
  });

  it('replans with dependency block', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-tasks-'));
    await writeTaskGraph(dir, createGraph([task({ id: 'T1' }), task({ id: 'T2' })]), 'run.tasks');
    const proposalPath = join(dir, 'proposal.tasks');
    await writeFile(proposalPath, 'id: T2\ndependsOn: T1\n');
    await runTaskCommand({ dir, tasksFile: 'run.tasks', command: { kind: 'replan', file: proposalPath } });
    const saved = parseTaskGraph(await readFile(taskGraphPath(dir, 'run.tasks'), 'utf8'));
    assert.ok(saved.tasks.find((t) => t.id === 'T2')?.dependsOn.includes('T1'));
  });
});
