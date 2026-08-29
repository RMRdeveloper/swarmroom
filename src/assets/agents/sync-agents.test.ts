import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const AGENTS = [
  'sw-planner',
  'sw-implementer',
  'sw-code-reviewer',
  'sw-verifier',
  'sw-fixer',
] as const;

const BASELINE_MARKER =
  '<!-- GENERATED from src/assets/artifacts/CODING_GUIDELINES.md — do not edit -->';
const TOOLING_MARKER = '<!-- GENERATED tooling — do not edit -->';

describe('sync-agents', () => {
  for (const name of AGENTS) {
    it(`${name} contains GENERATED baseline and tooling`, () => {
      const p = `src/assets/agents/${name}.md`;
      const raw = readFileSync(p, 'utf8');
      assert.ok(raw.includes(BASELINE_MARKER), `${p} missing baseline marker`);
      assert.ok(raw.includes(TOOLING_MARKER), `${p} missing tooling marker`);
      assert.ok(raw.includes('## Baseline standards'), `${p} missing baseline heading`);
      assert.ok(raw.includes('## Deterministic tooling'), `${p} missing tooling heading`);
      assert.ok(
        raw.includes('node .swarmroom/artifacts/check-comments.mjs --staged'),
        `${p} missing check-comments wiring`,
      );
      assert.ok(
        raw.includes('node src/assets/artifacts/findings-validator.mjs --file <path>'),
        `${p} missing findings-validator wiring`,
      );
      assert.ok(
        raw.includes('src/shared/kernel/pipeline.ts'),
        `${p} missing pipeline agents wiring`,
      );
      assert.ok(
        raw.includes('assertTasksFileSafe') && raw.includes('recordToTask'),
        `${p} missing tasks-format wiring`,
      );
      assert.ok(raw.includes('If GENERATED block missing, read'), `${p} missing fallback anchor`);
    });
  }

  it('researcher agents do not contain baseline', () => {
    for (const name of ['sw-researcher', 'sw-web-researcher'] as const) {
      const p = `src/assets/agents/${name}.md`;
      const raw = readFileSync(p, 'utf8');
      assert.ok(!raw.includes(BASELINE_MARKER), `${p} should not contain baseline marker`);
      assert.ok(!raw.includes(TOOLING_MARKER), `${p} should not contain tooling marker`);
    }
  });

  it('sync:agents --check passes', () => {
    const r = spawnSync('node', ['scripts/sync-agents.mjs', '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, `sync:agents --check failed: ${r.stderr}${r.stdout}`);
    assert.match(r.stdout, /agents sync check: ok/);
  });

  it('baseline table is verbatim from CODING_GUIDELINES', () => {
    const guidelines = readFileSync('src/assets/artifacts/CODING_GUIDELINES.md', 'utf8');
    const tableLines = guidelines
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .slice(0, 22)
      .join('\n');
    for (const name of AGENTS) {
      const raw = readFileSync(`src/assets/agents/${name}.md`, 'utf8');
      assert.ok(raw.includes(tableLines.slice(0, 30)), `${name} missing verbatim table`);
    }
  });
});
