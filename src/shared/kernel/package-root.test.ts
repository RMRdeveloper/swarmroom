import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assetsDir,
  clearPackageCacheForTests,
  packageRoot,
  packageVersion,
} from './package-root.ts';

describe('package-root cache', () => {
  it('caches packageRoot and returns same reference', () => {
    clearPackageCacheForTests();
    const first = packageRoot();
    const second = packageRoot();
    assert.equal(first, second);
  });

  it('caches packageVersion and returns same value', () => {
    clearPackageCacheForTests();
    const first = packageVersion();
    const second = packageVersion();
    assert.equal(first, second);
    assert.match(first, /^\d+\.\d+\.\d+/);
  });

  it('clearPackageCacheForTests invalidates cache', () => {
    const before = packageRoot();
    clearPackageCacheForTests();
    const after = packageRoot();
    assert.equal(before, after);
    const v1 = packageVersion();
    clearPackageCacheForTests();
    const v2 = packageVersion();
    assert.equal(v1, v2);
  });

  it('assetsDir resolves to src/assets under root', () => {
    const root = packageRoot();
    const dir = assetsDir();
    assert.ok(dir.startsWith(root));
    assert.ok(dir.endsWith('src/assets'));
  });

  it('packageRoot throws for missing package.json with bogus metaUrl', () => {
    assert.throws(() => packageRoot('file:///tmp/nonexistent/file.ts'), /package\.json not found/);
  });
});
