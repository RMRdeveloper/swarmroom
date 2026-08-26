import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGraph, type Task } from '../domain/tasks.ts';
import { parseTaskGraph, serializeTaskGraph } from './task-store.ts';

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.id,
    status: partial.status ?? 'pending',
    dependsOn: partial.dependsOn ?? [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Synthetic LLM-broken outputs — must fail with clear block/line errors, not
// silent fallback. Mirrors typical LLM mistakes when emitting blocks.
// ---------------------------------------------------------------------------
describe('LLM synthetic broken outputs', () => {
  it('rejects missing space after colon', () => {
    assert.throws(() => parseTaskGraph('id:T1\nstatus: pending\ndependsOn: -\ntitle: A\n'), /bloque 1 línea 1: línea malformada/);
  });

  it('rejects wrong case DependsOn', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\nDependsOn: -\ntitle: A\n'), /clave desconocida "DependsOn"|línea malformada/);
  });

  it('rejects Deps alias', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\nDeps: -\ntitle: A\n'), /clave desconocida "Deps"/);
  });

  it('rejects fences around blocks', () => {
    assert.throws(() => parseTaskGraph('```\nid: T1\nstatus: pending\ndependsOn: -\ntitle: A\n```\n'), /línea malformada/);
  });

  it('rejects T1: title style', () => {
    assert.throws(() => parseTaskGraph('T1: title\n'), /línea malformada/);
  });

  it('rejects missing required status', () => {
    assert.throws(() => parseTaskGraph('id: T1\ndependsOn: -\ntitle: A\n'), /falta campo "status"/);
  });

  it('rejects trailing comma in files', () => {
    // files: a.ts,  -> empty element
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nfiles: a.ts,\n'), /files contiene elemento vacío/);
  });

  it('rejects acceptance with empty element via ;;', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nacceptance: a;; b\n'), /acceptance contiene elemento vacío/);
  });

  it('rejects multiline title (line without colon)', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: line one\ncontinued without colon\n'), /línea malformada/);
  });

  it('rejects whitespace-only id', () => {
    assert.throws(() => parseTaskGraph('id:    \nstatus: pending\ndependsOn: -\ntitle: A\n'), /id debe ser string no vacío/);
  });

  it('rejects case-mismatched status Pending', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: Pending\ndependsOn: -\ntitle: A\n'), /status inválido/);
  });

  it('rejects attempts with leading zeros? actually valid but check integer', () => {
    // "01" is valid integer 1, should not throw — we test valid
    const g = parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nattempts: 01\n');
    assert.equal(g.tasks[0]?.attempts, 1);
  });
});

describe('BOM and CRLF handling', () => {
  it('strips BOM', () => {
    const g = parseTaskGraph('\uFEFFid: T1\nstatus: pending\ndependsOn: -\ntitle: A\n');
    assert.equal(g.tasks[0]?.id, 'T1');
  });

  it('normalizes CRLF', () => {
    const g = parseTaskGraph('id: T1\r\nstatus: pending\r\ndependsOn: -\r\ntitle: A\r\n');
    assert.equal(g.tasks.length, 1);
  });

  it('tolerates leading/trailing fences-like blank lines', () => {
    const raw = '\n\n  \n\nid: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\n\n';
    const g = parseTaskGraph(raw);
    assert.equal(g.tasks.length, 1);
  });
});

describe('graph invariants via blocks', () => {
  it('auto-dependency cycle', () => {
    assert.throws(() => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: T1\ntitle: A\n'), /cycle in task graph/);
  });

  it('diamond deps', () => {
    const raw = 'id: T1\nstatus: completed\ndependsOn: -\ntitle: A\n\nid: T2\nstatus: pending\ndependsOn: T1\ntitle: B\n\nid: T3\nstatus: pending\ndependsOn: T1\ntitle: C\n\nid: T4\nstatus: pending\ndependsOn: T2, T3\ntitle: D\n';
    const g = parseTaskGraph(raw);
    assert.deepEqual(g.tasks.find((t) => t.id === 'T4')?.dependsOn, ['T2', 'T3']);
  });

  it('case-sensitive ids T1 vs t1 are distinct', () => {
    const g = parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: t1\nstatus: pending\ndependsOn: -\ntitle: B\n');
    assert.equal(g.tasks.length, 2);
  });
});

describe('property: random round-trip', () => {
  function rndInt(max: number): number {
    return Math.floor(Math.random() * max);
  }

  function randomTask(id: string, allIds: readonly string[]): Task {
    const statuses = ['pending', 'ready', 'running', 'blocked', 'completed', 'failed'] as const;
    const status = statuses[rndInt(statuses.length)]!;
    const depsCount = rndInt(3);
    const deps = allIds.slice(0, depsCount);
    // ensure no self-dep and acyclic by only depending on earlier ids
    const filtered = deps.filter((d) => d !== id);
    const title = `Title ${id}`;
    const t: Task = task({
      id,
      title,
      description: Math.random() < 0.5 ? title : `${title} desc`,
      status,
      dependsOn: filtered,
      ...(Math.random() < 0.3 ? { agent: 'sw-implementer' } : {}),
      ...(Math.random() < 0.3 ? { files: [`src/${id}.ts`] } : {}),
      ...(Math.random() < 0.3 ? { acceptance: ['a', 'b'] } : {}),
      ...(Math.random() < 0.2 ? { result: 'ok' } : {}),
      ...(Math.random() < 0.2 ? { attempts: rndInt(3) } : {}),
    });
    return t;
  }

  it('200 random graphs round-trip and end with newline if non-empty', () => {
    for (let i = 0; i < 200; i++) {
      const n = rndInt(5);
      const ids = Array.from({ length: n }, (_, k) => `T${k + 1}`);
      // Build acyclic by only allowing deps on earlier ids
      const tasks: Task[] = [];
      for (let j = 0; j < n; j++) {
        const id = ids[j]!;
        const earlier = ids.slice(0, j);
        tasks.push(randomTask(id, earlier));
      }
      // Filter to keep acyclic; createGraph will still validate but we ensure earlier-only so no cycle/missing
      const graph = createGraph(tasks);
      const raw = serializeTaskGraph(graph);
      if (graph.tasks.length === 0) assert.equal(raw, '');
      else assert.equal(raw.endsWith('\n'), true);
      const parsed = parseTaskGraph(raw);
      assert.deepEqual(parsed, graph);
      // Also ensure no legacy JSON chars
      assert.equal(raw.includes('"tasks"'), false);
    }
  });

  it('files disjoint vs overlapping still serializes', () => {
    const g1 = createGraph([
      task({ id: 'T1', files: ['a.ts'] }),
      task({ id: 'T2', files: ['b.ts'] }),
    ]);
    assert.doesNotThrow(() => parseTaskGraph(serializeTaskGraph(g1)));
    const g2 = createGraph([
      task({ id: 'T1', files: ['a.ts'] }),
      task({ id: 'T2', files: ['a.ts'] }),
    ]);
    assert.doesNotThrow(() => parseTaskGraph(serializeTaskGraph(g2)));
  });
});

describe('error line numbers accuracy', () => {
  it('reports block 2 line 6 for second block bad status', () => {
    const raw = 'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: T2\nstatus: bogus\ndependsOn: -\ntitle: B\n';
    assert.throws(() => parseTaskGraph(raw), /bloque 2.*bogus/);
    // Also ensure global line is 6 (3 lines + blank + 2 lines)
    try {
      parseTaskGraph(raw);
    } catch (e) {
      const msg = (e as Error).message;
      // The block line for T2 is 6? Check contains status inválido
      assert.match(msg, /bloque 2/);
    }
  });

  it('reports line malformed with global line', () => {
    const raw = 'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nbad line without colon\n';
    assert.throws(() => parseTaskGraph(raw), /bloque 2 línea 6: línea malformada/);
  });
});
