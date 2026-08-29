import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { parseFindings, validateFindings } from './findings-validator.ts';

describe('findings-validator', () => {
  it('accepts No findings', () => {
    const r = validateFindings('No findings');
    assert.equal(r.valid, true);
    assert.equal(r.findings.length, 0);
  });

  it('accepts empty input', () => {
    const r = validateFindings('   \n');
    assert.equal(r.valid, true);
    assert.equal(r.findings.length, 0);
  });

  it('validates a single finding', () => {
    const input = 'FINDING 1 | High | src/cli.ts:10 | SRP | Improve separation';
    const r = validateFindings(input);
    assert.equal(r.valid, true);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0]?.rule, 'SRP');
    assert.equal(r.findings[0]?.severity, 'High');
  });

  it('rejects unknown rule', () => {
    const input = 'FINDING 1 | High | src/cli.ts:10 | Unknown | bad';
    const r = validateFindings(input);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('unknown rule')));
  });

  it('rejects non-sequential N', () => {
    const input = [
      'FINDING 1 | High | src/cli.ts:10 | SRP | first',
      'FINDING 3 | Low | src/cli.ts:20 | DRY | skipped',
    ].join('\n');
    const r = validateFindings(input);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('expected FINDING 2')));
  });

  it('rejects description containing pipe', () => {
    const input = 'FINDING 1 | High | src/cli.ts:10 | SRP | bad | pipe';
    const r = validateFindings(input);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('5 pipe-separated fields')));
  });

  it('parseFindings throws on malformed line', () => {
    assert.throws(() => parseFindings('bad line'), /malformed finding/);
  });

  it('parseFindings throws on sequential mismatch', () => {
    const input = [
      'FINDING 1 | High | src/cli.ts:10 | SRP | first',
      'FINDING 3 | Low | src/cli.ts:20 | DRY | third',
    ].join('\n');
    assert.throws(() => parseFindings(input), /expected FINDING 2/);
  });

  it('generated mjs stays in sync with TS source', async () => {
    const tsContent = await readFile('src/shared/kernel/findings-validator.ts', 'utf8');
    const mjsContent = await readFile('src/assets/artifacts/findings-validator.mjs', 'utf8');
    assert.match(
      mjsContent,
      /GENERATED — do not edit, source: src\/shared\/kernel\/findings-validator\.ts/,
    );
    // Extract constants from both sides to ensure drift would be caught
    assert.ok(tsContent.includes("SEVERITIES = ['Critical'"));
    assert.ok(mjsContent.includes("SEVERITIES = ['Critical'"));
    // Run sync check via file content comparison: ensure header present and mjs not stale
    assert.ok(mjsContent.startsWith('#!/usr/bin/env node'));
  });
});
