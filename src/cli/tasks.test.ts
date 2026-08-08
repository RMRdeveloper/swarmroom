import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGraph, type Task } from '../domain/tasks.ts';
import { taskGraphPath } from '../io/task-store.ts';
import { formatTaskLines, formatTaskSummary, glyphFor, renderTasks } from './tasks.ts';

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
    assert.equal(renderTasks(null, { dir: '/tmp/proj', json: false }), `No task graph at ${taskGraphPath('/tmp/proj')}.`);
  });

  it('dumps JSON when requested', () => {
    const graph = createGraph([task({ id: 'T1', status: 'pending' })]);
    const dumped = renderTasks(graph, { dir: '/tmp/proj', json: true });
    assert.match(dumped, /"id": "T1"/);
    assert.match(dumped, /"status": "pending"/);
  });

  it('renders an empty graph as zero tasks', () => {
    assert.equal(renderTasks(createGraph([]), { dir: '/tmp/proj', json: false }), '\n0 tasks');
  });
});
