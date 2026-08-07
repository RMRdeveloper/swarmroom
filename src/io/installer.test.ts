import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { targets } from '../domain/targets.ts';
import { install, installGuidelines } from './installer.ts';

const cursor = targets.find((t) => t.id === 'cursor');
assert.ok(cursor);

describe('installer', () => {
  const dirs: string[] = [];

  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-'));
    dirs.push(dir);
    return dir;
  }

  it('installs agents and skills into a temp root', async () => {
    const root = await tempDir();
    const report = await install({ target: cursor, root }, true);
    assert.ok(report.files.length > 0);
    assert.ok(report.files.every((f) => f.status === 'new'));
    const sample = report.files[0]!;
    const content = await readFile(sample.dest, 'utf8');
    assert.ok(content.length > 0);
  });

  it('skips existing files when overwrite is false', async () => {
    const root = await tempDir();
    await install({ target: cursor, root }, true);
    const second = await install({ target: cursor, root }, false);
    assert.ok(second.files.every((f) => f.status === 'skipped'));
  });

  it('updates existing files when overwrite is true', async () => {
    const root = await tempDir();
    await install({ target: cursor, root }, true);
    const second = await install({ target: cursor, root }, true);
    assert.ok(second.files.every((f) => f.status === 'updated'));
  });

  it('installGuidelines skips vs overwrites', async () => {
    const project = await tempDir();
    const first = await installGuidelines(project, false);
    assert.equal(first.status, 'new');
    const skipped = await installGuidelines(project, false);
    assert.equal(skipped.status, 'skipped');
    const updated = await installGuidelines(project, true);
    assert.equal(updated.status, 'updated');
  });

  it('fails fast when a required asset is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(() => install({ target: cursor, root }, true, emptyAssets), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing asset\(s\)/);
      assert.match(err.message, /sw-planner\.md/);
      return true;
    });
  });

  it('fails fast when guidelines artifact is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(() => installGuidelines(root, true, emptyAssets), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing asset\(s\)/);
      assert.match(err.message, /CODING_GUIDELINES\.md/);
      return true;
    });
  });
});
