import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseConfirm, parseSelection } from './prompts.ts';

describe('parseSelection', () => {
  it('parses valid indices', () => {
    assert.deepEqual(parseSelection('1,3', 3), [1, 3]);
  });

  it('de-duplicates while preserving first-seen order', () => {
    assert.deepEqual(parseSelection('2,1,2,3,1', 3), [2, 1, 3]);
  });

  it('rejects empty tokens and out-of-range', () => {
    assert.equal(parseSelection('1,,2', 3), null);
    assert.equal(parseSelection('0', 3), null);
    assert.equal(parseSelection('4', 3), null);
    assert.equal(parseSelection('abc', 3), null);
  });
});

describe('parseConfirm', () => {
  it('uses default on empty', () => {
    assert.equal(parseConfirm('', true), true);
    assert.equal(parseConfirm('  ', false), false);
  });

  it('accepts y/yes and n/no', () => {
    assert.equal(parseConfirm('y', false), true);
    assert.equal(parseConfirm('YES', false), true);
    assert.equal(parseConfirm('n', true), false);
    assert.equal(parseConfirm('No', true), false);
  });

  it('returns null for invalid input', () => {
    assert.equal(parseConfirm('maybe', true), null);
    assert.equal(parseConfirm('1', false), null);
  });
});
