import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { targets } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pipelineSkill = readFileSync(join(here, 'skills', 'sw-pipeline', 'SKILL.md'), 'utf8');

const FINDING_LINE =
  '`FINDING <N> | <Critical|High|Medium> | <file:line> | <rule> | <description>`';

const PRECEDENCE =
  'Task instructions may narrow scope, files, and acceptance checks for this run; they do not override repo docs (`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present) or the baseline standards those docs leave in force.';

describe('sw-pipeline skill', () => {
  it('delegates to the five pipeline agents', () => {
    for (const name of ['sw-planner', 'sw-implementer', 'sw-code-reviewer', 'sw-verifier', 'sw-fixer']) {
      assert.ok(pipelineSkill.includes(name), `missing ${name}`);
    }
  });

  it('keeps the FINDING contract', () => {
    assert.ok(pipelineSkill.includes(FINDING_LINE));
  });

  it('keeps CODING_GUIDELINES mandatory', () => {
    assert.ok(pipelineSkill.includes('CODING_GUIDELINES'));
    assert.ok(pipelineSkill.includes(PRECEDENCE));
    assert.ok(!pipelineSkill.toLowerCase().includes('guidelines are optional'));
  });

  it('skips planner only for trivial work; planner owns grilling otherwise', () => {
    assert.match(pipelineSkill, /No `sw-planner`, no grilling/);
    assert.match(pipelineSkill, /only the planner runs/);
  });

  it('survives rewriteSkill for every target', () => {
    assert.ok(
      targets.some((t) => t.id === 'codex'),
      'codex must be among rewriteSkill targets (non-cursor dropToBase)',
    );
    for (const target of targets) {
      const rewritten = target.rewriteSkill(pipelineSkill);
      assert.ok(!rewritten.includes('\n\n\n'), `${target.id}: triple newlines`);
      assert.ok(rewritten.includes('sw-implementer'), `${target.id}: lost implementer`);
      assert.ok(rewritten.includes(FINDING_LINE), `${target.id}: lost FINDING line`);
      if (target.id === 'cursor') {
        assert.match(rewritten, /^argument-hint:/m);
        assert.match(rewritten, /^disable-model-invocation:/m);
      } else {
        assert.ok(!/^argument-hint:/m.test(rewritten), `${target.id}: argument-hint survived`);
        assert.ok(
          !/^disable-model-invocation:/m.test(rewritten),
          `${target.id}: disable-model-invocation survived`,
        );
      }
    }
  });
});
