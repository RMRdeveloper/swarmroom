import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const VALIDATOR = 'src/assets/artifacts/validate-spec.mjs';

/**
 * Run validator on file path, return result.
 */
function runValidator(file: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [VALIDATOR, '--file', file], { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Create valid spec content.
 */
function validSpec(): string {
  return [
    '# My Feature',
    '',
    '## Context',
    '',
    'Some context.',
    '',
    '## Goal',
    '',
    'Goal text.',
    '',
    '## Non-goals',
    '',
    'Not this.',
    '',
    '## Requirements',
    '',
    '- Req 1',
    '',
    '## Acceptance Criteria',
    '',
    '- **Scenario:** happy path',
    '  - Given a user',
    '  - When they act',
    '  - Then it works',
    '',
    '## Constraints',
    '',
    '- Must be fast',
    '',
    '## Open Questions',
    '',
    '- None',
    '',
  ].join('\n');
}

describe('validate-spec.mjs', () => {
  it('accepts a valid spec', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    writeFileSync(file, validSpec(), 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Valid spec/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects frontmatter', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    writeFileSync(file, `---\ntitle: foo\n---\n${validSpec()}`, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /frontmatter/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects missing trailing newline', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = validSpec().trimEnd();
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must end with/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects invalid slug (uppercase / underscore)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'My_Feature.md');
    writeFileSync(file, validSpec(), 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /slug/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects slug longer than 60', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const long = 'a'.repeat(61);
    const file = path.join(dir, `${long}.md`);
    writeFileSync(file, validSpec(), 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exceeds 60/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects headings out of order', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = [
      '# My Feature',
      '',
      '## Goal',
      '',
      'Goal text.',
      '',
      '## Context',
      '',
      'Context text.',
      '',
      '## Requirements',
      '',
      '- Req',
      '',
      '## Acceptance Criteria',
      '',
      '- **Scenario:** x',
      '  - Given a',
      '  - When b',
      '  - Then c',
      '',
    ].join('\n');
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of order/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects empty section', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = [
      '# My Feature',
      '',
      '## Context',
      '',
      '',
      '## Goal',
      '',
      'Goal text.',
      '',
      '## Requirements',
      '',
      '- Req',
      '',
      '## Acceptance Criteria',
      '',
      '- **Scenario:** x',
      '  - Given a',
      '  - When b',
      '  - Then c',
      '',
    ].join('\n');
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not be empty/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects missing Given/When/Then', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = [
      '# My Feature',
      '',
      '## Context',
      '',
      'ctx',
      '',
      '## Goal',
      '',
      'goal',
      '',
      '## Requirements',
      '',
      '- Req',
      '',
      '## Acceptance Criteria',
      '',
      '- Just a bullet without GWT',
      '',
    ].join('\n');
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Given\/When\/Then/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects unknown heading', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = [
      '# My Feature',
      '',
      '## Context',
      '',
      'ctx',
      '',
      '## FooBar',
      '',
      'something',
      '',
    ].join('\n');
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown heading/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects duplicate heading', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'validate-spec-'));
    const file = path.join(dir, 'my-feature.md');
    const content = [
      '# My Feature',
      '',
      '## Context',
      '',
      'ctx',
      '',
      '## Context',
      '',
      'again',
      '',
    ].join('\n');
    writeFileSync(file, content, 'utf8');
    const result = runValidator(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate heading/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('validator file is ESM with shebang and no deps', () => {
    const raw = readFileSync(VALIDATOR, 'utf8');
    assert.ok(raw.startsWith('#!/usr/bin/env node'));
    assert.ok(raw.includes('PATTERNS'));
    assert.ok(!raw.includes('import(') || raw.includes('node:fs'));
  });
});
