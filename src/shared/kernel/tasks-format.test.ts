import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertTasksFileSafe, validateTasksFile } from './tasks-format.ts';

describe('assertTasksFileSafe', () => {
  it('accepts simple relative path', () => {
    assert.equal(assertTasksFileSafe('run.tasks'), 'run.tasks');
  });

  it('accepts nested relative path', () => {
    assert.equal(assertTasksFileSafe('a/b/c.tasks'), 'a/b/c.tasks');
  });

  it('accepts absolute path', () => {
    assert.equal(assertTasksFileSafe('/tmp/a.tasks'), '/tmp/a.tasks');
  });

  it('normalizes backslashes', () => {
    assert.equal(assertTasksFileSafe(String.raw`a\b\c.tasks`), 'a/b/c.tasks');
  });

  it('rejects empty', () => {
    assert.throws(() => assertTasksFileSafe(''), /non-empty/);
  });

  it('rejects null bytes', () => {
    assert.throws(() => assertTasksFileSafe('a\0b'), /null bytes/);
  });

  it('rejects .. segment', () => {
    assert.throws(() => assertTasksFileSafe('../escape.tasks'), /must not contain/);
    assert.throws(() => assertTasksFileSafe('a/../b.tasks'), /must not contain/);
    assert.throws(() => assertTasksFileSafe('a/b/../../c.tasks'), /must not contain/);
    assert.throws(() => assertTasksFileSafe(String.raw`a\..\b.tasks`), /must not contain/);
  });

  it('allows .. in filename substring but not segment', () => {
    assert.equal(assertTasksFileSafe('a..b.tasks'), 'a..b.tasks');
    assert.equal(assertTasksFileSafe('..a.tasks'), '..a.tasks');
  });

  it('validateTasksFile alias works', () => {
    assert.equal(validateTasksFile('x.tasks'), 'x.tasks');
    assert.throws(() => validateTasksFile('x/../y.tasks'), /must not contain/);
  });
});
