import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { error, muted, status, taskStatus } from './style.ts';

describe('style', () => {
  it('status colors by FileStatus', () => {
    assert.ok(status('new', 'hello').includes('hello'));
    assert.ok(status('updated', 'hello').includes('hello'));
    assert.ok(status('failed', 'hello').includes('hello'));
    assert.ok(status('skipped', 'hello').includes('hello'));
  });

  it('taskStatus colors by TaskStatus', () => {
    for (const s of ['completed', 'running', 'failed', 'blocked', 'pending', 'ready'] as const) {
      assert.ok(taskStatus(s, s).includes(s));
    }
  });

  it('error and muted wrap text', () => {
    assert.ok(error('oops').includes('oops'));
    assert.ok(muted('quiet').includes('quiet'));
  });
});
