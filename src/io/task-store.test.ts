import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { createGraph, type Task } from '../domain/tasks.ts';
import {
  parseTaskGraph,
  readTaskGraph,
  serializeTaskGraph,
  taskGraphPath,
  writeTaskGraph,
} from './task-store.ts';

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.id,
    status: partial.status ?? 'pending',
    dependsOn: partial.dependsOn ?? [],
    ...partial,
  };
}

describe('parseTaskGraph / serializeTaskGraph', () => {
  it('round-trips a valid graph', () => {
    const graph = createGraph([
      task({ id: 'T1', title: 'Implement', agent: 'sw-implementer', files: ['a.ts'] }),
      task({ id: 'T2', dependsOn: ['T1'], agent: 'sw-verifier' }),
    ]);
    const parsed = parseTaskGraph(serializeTaskGraph(graph));
    assert.deepEqual(parsed, graph);
  });

  it('rejects invalid JSON', () => {
    assert.throws(() => parseTaskGraph('{'), /invalid task graph JSON/);
  });

  it('rejects unknown root keys', () => {
    assert.throws(
      () => parseTaskGraph(JSON.stringify({ tasks: [], transcript: 'nope' })),
      /unknown task graph key: transcript/,
    );
  });

  it('rejects an invalid status', () => {
    assert.throws(
      () =>
        parseTaskGraph(
          JSON.stringify({
            tasks: [{ id: 'T1', title: 'T1', description: 'T1', status: 'done', dependsOn: [] }],
          }),
        ),
      /invalid status: done/,
    );
  });

  it('rejects a missing tasks array', () => {
    assert.throws(() => parseTaskGraph('{}'), /missing tasks array/);
  });

  it('rejects unknown task keys', () => {
    assert.throws(
      () =>
        parseTaskGraph(
          JSON.stringify({
            tasks: [
              {
                id: 'T1',
                title: 'T1',
                description: 'T1',
                status: 'pending',
                dependsOn: [],
                transcript: 'nope',
              },
            ],
          }),
        ),
      /tasks\[0\] unknown key: transcript/,
    );
  });
});

describe('readTaskGraph / writeTaskGraph', () => {
  const dirs: string[] = [];

  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-'));
    dirs.push(dir);
    return dir;
  }

  it('round-trips on disk', async () => {
    const root = await tempDir();
    const graph = createGraph([task({ id: 'T1', status: 'completed', result: 'ok' })]);
    const dest = await writeTaskGraph(root, graph);
    assert.equal(dest, taskGraphPath(root));
    const loaded = await readTaskGraph(root);
    assert.deepEqual(loaded, graph);
  });

  it('returns null when the file is missing', async () => {
    const root = await tempDir();
    assert.equal(await readTaskGraph(root), null);
  });
});
