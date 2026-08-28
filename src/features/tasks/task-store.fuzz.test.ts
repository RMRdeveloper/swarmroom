import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTaskGraph, serializeTaskGraph } from './task-store.ts';
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

describe('LLM synthetic broken outputs', () => {
  it('rejects missing space after colon', () => {
    assert.throws(
      () => parseTaskGraph('id:T1\nstatus: pending\ndependsOn: -\ntitle: A\n'),
      /block 1 line 1: malformed line/,
    );
  });

  it('rejects wrong case DependsOn', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\nDependsOn: -\ntitle: A\n'),
      /unknown key "DependsOn"|malformed line/,
    );
  });

  it('rejects Deps alias', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\nDeps: -\ntitle: A\n'),
      /unknown key "Deps"/,
    );
  });

  it('rejects fences around blocks', () => {
    assert.throws(
      () => parseTaskGraph('```\nid: T1\nstatus: pending\ndependsOn: -\ntitle: A\n```\n'),
      /malformed line/,
    );
  });

  it('rejects T1: title style', () => {
    assert.throws(() => parseTaskGraph('T1: title\n'), /malformed line|unknown key/);
  });

  it('rejects missing required status', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\ndependsOn: -\ntitle: A\n'),
      /missing field "status"/,
    );
  });

  it('rejects trailing comma in files', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nfiles: a.ts,\n'),
      /files contains empty element/,
    );
  });

  it('rejects acceptance with empty element via ;;', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: -\ntitle: A\nacceptance: a;; b\n'),
      /acceptance contains empty element/,
    );
  });

  it('rejects multiline title (line without colon)', () => {
    assert.throws(
      () =>
        parseTaskGraph(
          'id: T1\nstatus: pending\ndependsOn: -\ntitle: line one\ncontinued without colon\n',
        ),
      /malformed line/,
    );
  });

  it('rejects whitespace-only id', () => {
    assert.throws(
      () => parseTaskGraph('id:    \nstatus: pending\ndependsOn: -\ntitle: A\n'),
      /id must be a non-empty string/,
    );
  });

  it('rejects case-mismatched status Pending', () => {
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: Pending\ndependsOn: -\ntitle: A\n'),
      /invalid status/,
    );
  });

  it('rejects attempts with leading zeros? actually valid but check integer', () => {
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
    assert.throws(
      () => parseTaskGraph('id: T1\nstatus: pending\ndependsOn: T1\ntitle: A\n'),
      /cycle in task graph/,
    );
  });

  it('diamond deps', () => {
    const raw =
      'id: T1\nstatus: completed\ndependsOn: -\ntitle: A\n\nid: T2\nstatus: pending\ndependsOn: T1\ntitle: B\n\nid: T3\nstatus: pending\ndependsOn: T1\ntitle: C\n\nid: T4\nstatus: pending\ndependsOn: T2, T3\ntitle: D\n';
    const g = parseTaskGraph(raw);
    assert.deepEqual(g.tasks.find((t) => t.id === 'T4')?.dependsOn, ['T2', 'T3']);
  });

  it('case-sensitive ids T1 vs t1 are distinct', () => {
    const g = parseTaskGraph(
      'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: t1\nstatus: pending\ndependsOn: -\ntitle: B\n',
    );
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
      const tasks: Task[] = [];
      for (let j = 0; j < n; j++) {
        const id = ids[j]!;
        const earlier = ids.slice(0, j);
        tasks.push(randomTask(id, earlier));
      }
      const graph = createGraph(tasks);
      const raw = serializeTaskGraph(graph);
      if (graph.tasks.length === 0) assert.equal(raw, '');
      else assert.equal(raw.endsWith('\n'), true);
      const parsed = parseTaskGraph(raw);
      assert.deepEqual(parsed, graph);
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
    const raw =
      'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nid: T2\nstatus: bogus\ndependsOn: -\ntitle: B\n';
    assert.throws(() => parseTaskGraph(raw), /block 2.*bogus/);
    try {
      parseTaskGraph(raw);
    } catch (error) {
      const msg = (error as Error).message;
      assert.match(msg, /block 2/);
    }
  });

  it('reports line malformed with global line', () => {
    const raw = 'id: T1\nstatus: pending\ndependsOn: -\ntitle: A\n\nbad line without colon\n';
    assert.throws(() => parseTaskGraph(raw), /block 2 line 6: malformed line/);
  });
});
