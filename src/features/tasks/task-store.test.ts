import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  parseTaskGraph,
  readTaskGraph,
  serializeTaskGraph,
  taskGraphPath,
  writeTaskGraph,
} from './task-store.ts';
import { createGraph, type Task } from './tasks.ts';

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

  it('round-trips task mínimo', () => {
    const graph = createGraph([task({ id: 'T1', title: 'Solo' })]);
    const raw = serializeTaskGraph(graph);
    assert.match(raw, /id: T1/);
    assert.match(raw, /status: pending/);
    assert.match(raw, /dependsOn: -/);
    assert.match(raw, /title: Solo/);
    const parsed = parseTaskGraph(raw);
    assert.deepEqual(parsed, graph);
  });

  it('round-trips todos los campos', () => {
    const g2 = createGraph([
      task({
        id: 'T1',
        title: 'Full',
        description: 'Desc full',
        status: 'running',
        dependsOn: [],
        agent: 'sw-implementer',
        files: ['a.ts', 'b.ts'],
        acceptance: ['tests pass', 'no magic'],
        attempts: 2,
      }),
    ]);
    const parsed = parseTaskGraph(serializeTaskGraph(g2));
    assert.deepEqual(parsed, g2);
  });

  it('maneja deps múltiples con espacios', () => {
    const raw = `id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: T3\nstatus: pending\ndependsOn: -\ntitle: C\n\nid: T4\nstatus: pending\ndependsOn: -\ntitle: D\n\nid: T2\nstatus: pending\ndependsOn: T1, T3 , T4\ntitle: B\n`;
    const graph = parseTaskGraph(raw);
    assert.deepEqual(graph.tasks[3]?.dependsOn, ['T1', 'T3', 'T4']);
  });

  it('rechaza bloque malformado (línea sin ": ")', () => {
    assert.throws(
      () => parseTaskGraph('id T1\nstatus: pending\ndependsOn: -\ntitle: A\n'),
      /bloque 1 línea 1: línea malformada/,
    );
  });

  it('rechaza campo desconocido', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\ntranscript: nope\n'),
      /bloque 1: clave desconocida "transcript"/,
    );
  });

  it('rechaza clave duplicada', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nid: T2\n'),
      /bloque 1: clave duplicada "id"/,
    );
  });

  it('rechaza status inválido', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: done\ndependsOn: -\ntitle: A\n'),
      /bloque 1: status inválido "done"/,
    );
  });

  it('rechaza falta de campo requerido', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ntitle: A\n'),
      /bloque 1: falta campo "dependsOn"/,
    );
    assert.throws(
      () => parseTaskGraph('status: pending\ndependsOn: -\ntitle: A\n'),
      /bloque 1: falta campo "id"/,
    );
  });

  it('rechaza dependsOn con elemento vacío', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: T1, , T2\ntitle: A\n'),
      /bloque 1: dependsOn contiene elemento vacío/,
    );
  });

  it('rechaza mezcla de "-" con valores', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -, T1\ntitle: A\n'),
      /bloque 1: dependsOn no puede mezclar/,
    );
  });

  it('rechaza attempts inválido', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nattempts: two\n'),
      /bloque 1: attempts debe ser entero/,
    );
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nattempts: -1\n'),
      /bloque 1: attempts debe ser entero/,
    );
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nattempts: 1.5\n'),
      /bloque 1: attempts debe ser entero/,
    );
  });

  it('archivo vacío es grafo vacío', () => {
    assert.deepEqual(parseTaskGraph(''), createGraph([]));
    assert.deepEqual(parseTaskGraph('   \n\n  \n'), createGraph([]));
  });

  it('tolerates extra blank lines y trailing newline', () => {
    const raw =
      '\n\nid: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\n\nid: T2\nstatus: pending\ndependsOn: T1\ntitle: B\n\n';
    const graph = parseTaskGraph(raw);
    assert.equal(graph.tasks.length, 2);
    assert.equal(graph.tasks[1]?.dependsOn[0], 'T1');
  });

  it('rechaza JSON legacy', () => {
    assert.throws(() => parseTaskGraph('{"tasks": []}'), /formato JSON legacy no soportado/);
    assert.throws(() => parseTaskGraph('  [1,2,3]'), /formato JSON legacy no soportado/);
  });

  it('serializa sentinel "-" para dependsOn vacío', () => {
    const graph = createGraph([task({ id: 'T1' })]);
    const raw = serializeTaskGraph(graph);
    assert.match(raw, /dependsOn: -/);
    assert.equal(raw.endsWith('\n'), true);
  });

  it('description fallback: si falta usa title', () => {
    const graph = parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: Solo title\n');
    assert.equal(graph.tasks[0]?.description, 'Solo title');
  });

  it('no serializa description si es igual a title', () => {
    const graph = createGraph([task({ id: 'T1', title: 'Same', description: 'Same' })]);
    const raw = serializeTaskGraph(graph);
    assert.equal(raw.includes('description:'), false);
    const parsed = parseTaskGraph(raw);
    assert.equal(parsed.tasks[0]?.description, 'Same');
  });

  it('reporta bloque correcto sin invalidar otros', () => {
    const raw =
      'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: T2\nstatus: bogus\ndependsOn: -\ntitle: B\n';
    assert.throws(() => parseTaskGraph(raw), /bloque 2: status inválido "bogus"/);
  });

  it('delegates duplicados/ciclos/deps inexistentes a createGraph', () => {
    assert.throws(
      () =>
        parseTaskGraph(
          'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: T1\nstatus: pending\ndependsOn: -\ntitle: B\n',
        ),
      /duplicate task id: T1/,
    );
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: T9\ntitle: A\n'),
      /task T1 depends on missing id: T9/,
    );
  });

  it('serializes files y acceptance con separadores correctos', () => {
    const graph = createGraph([
      task({ id: 'T1', files: ['a.ts', 'b.ts'], acceptance: ['a', 'b'] }),
    ]);
    const raw = serializeTaskGraph(graph);
    assert.match(raw, /files: a\.ts, b\.ts/);
    assert.match(raw, /acceptance: a; b/);
    const parsed = parseTaskGraph(raw);
    assert.deepEqual(parsed.tasks[0]?.files, ['a.ts', 'b.ts']);
    assert.deepEqual(parsed.tasks[0]?.acceptance, ['a', 'b']);
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
    const dest = await writeTaskGraph(root, graph, 'run-a.tasks');
    assert.equal(dest, taskGraphPath(root, 'run-a.tasks'));
    const loaded = await readTaskGraph(root, 'run-a.tasks');
    assert.deepEqual(loaded, graph);
  });

  it('round-trips with subdir', async () => {
    const root = await tempDir();
    const graph = createGraph([task({ id: 'T1', status: 'pending' })]);
    const dest = await writeTaskGraph(root, graph, 'nested/run-b.tasks');
    assert.equal(dest, taskGraphPath(root, 'nested/run-b.tasks'));
    assert.deepEqual(await readTaskGraph(root, 'nested/run-b.tasks'), graph);
    assert.equal(await readTaskGraph(root, 'nested/other.tasks'), null);
  });

  it('isolates two runIds', async () => {
    const root = await tempDir();
    await writeTaskGraph(root, createGraph([task({ id: 'T1', title: 'A' })]), 'a.tasks');
    await writeTaskGraph(root, createGraph([task({ id: 'T1', title: 'B' })]), 'b.tasks');
    const a = await readTaskGraph(root, 'a.tasks');
    const b = await readTaskGraph(root, 'b.tasks');
    assert.equal(a?.tasks[0]?.title, 'A');
    assert.equal(b?.tasks[0]?.title, 'B');
  });

  it('returns null when the file is missing', async () => {
    const root = await tempDir();
    assert.equal(await readTaskGraph(root, 'missing.tasks'), null);
  });

  it('rejects tasksFile with ..', async () => {
    const root = await tempDir();
    assert.throws(() => taskGraphPath(root, '../escape.tasks'), /must not contain `\.\.`/);
    assert.throws(() => taskGraphPath(root, 'a/../b.tasks'), /must not contain `\.\.`/);
  });

  it('persists blocks format on disk, not JSON', async () => {
    const root = await tempDir();
    const graph = createGraph([task({ id: 'T1' }), task({ id: 'T2', dependsOn: ['T1'] })]);
    await writeTaskGraph(root, graph, 'check.tasks');
    const raw = await readFile(taskGraphPath(root, 'check.tasks'), 'utf8');
    assert.match(raw, /id: T1/);
    assert.equal(raw.includes('"tasks"'), false);
    assert.equal(raw.endsWith('\n'), true);
  });
});
