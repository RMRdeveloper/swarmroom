import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { skills } from '../domain/pipeline.ts';
import { targets } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pipelineSkill = readFileSync(join(here, 'skills', 'sw-pipeline', 'SKILL.md'), 'utf8');
const transcribeDir = join(here, 'skills', 'transcribe-audio');
const transcribeSkill = readFileSync(join(transcribeDir, 'SKILL.md'), 'utf8');
const transcribePy = readFileSync(join(transcribeDir, 'transcribe.py'), 'utf8');

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

describe('skills registry', () => {
  it('has a SKILL.md for every registered skill', () => {
    for (const name of skills) {
      const skillPath = join(here, 'skills', name, 'SKILL.md');
      assert.ok(existsSync(skillPath), `missing ${skillPath}`);
    }
  });
});

describe('transcribe-audio skill', () => {
  it('has valid frontmatter', () => {
    const [before, frontmatter] = transcribeSkill.split('---');
    assert.equal(before, '');
    assert.ok(frontmatter);
    assert.match(frontmatter, /name:\s*transcribe-audio/);
    assert.match(frontmatter, /description:\s*\S/);
  });

  it('mentions ogg and opus as supported', () => {
    const body = transcribeSkill.split('---').slice(2).join('---');
    assert.match(body, /ogg/i);
    assert.match(body, /opus/i);
  });

  it('documents ffmpeg as an OS/apt requirement', () => {
    assert.match(transcribeSkill, /sudo apt install ffmpeg/);
    assert.match(transcribeSkill, /OS binary/);
    assert.ok(!/pip install ffmpeg/i.test(transcribeSkill));
  });

  it('prefers uv for Python dependency setup', () => {
    assert.match(transcribeSkill, /## Python dependency setup/);
    assert.match(transcribeSkill, /Preferred: `uv pip install faster-whisper`/);
    assert.match(transcribeSkill, /uv add faster-whisper/);
    assert.match(transcribeSkill, /pip install uv/);
    assert.match(transcribeSkill, /last resort/);
    assert.match(transcribeSkill, /Fallback only/);
    assert.match(transcribeSkill, /--break-system-packages/);
  });

  it('documents externally-managed-environment', () => {
    assert.match(transcribeSkill, /externally-managed-environment/);
    assert.match(transcribeSkill, /PEP 668/);
  });

  it('survives rewriteSkill for every target', () => {
    assert.ok(
      targets.some((t) => t.id === 'codex'),
      'codex must be among rewriteSkill targets (non-cursor dropToBase)',
    );
    for (const target of targets) {
      const rewritten = target.rewriteSkill(transcribeSkill);
      assert.ok(!rewritten.includes('\n\n\n'), `${target.id}: triple newlines`);
      assert.ok(rewritten.includes('uv'), `${target.id}: lost uv`);
      assert.ok(
        rewritten.includes('externally-managed-environment'),
        `${target.id}: lost externally-managed-environment`,
      );
      assert.ok(rewritten.includes('faster-whisper'), `${target.id}: lost faster-whisper`);
      assert.ok(rewritten.includes('ffmpeg'), `${target.id}: lost ffmpeg`);
      assert.ok(rewritten.includes('ogg'), `${target.id}: lost ogg`);
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

  it('mentions faster-whisper and large-v3-turbo', () => {
    assert.ok(transcribeSkill.includes('faster-whisper'));
    assert.ok(transcribeSkill.includes('large-v3-turbo'));
    assert.ok(transcribeSkill.includes('~809MB'));
    assert.doesNotMatch(transcribeSkill, /\bsmall\b/);
    assert.ok(
      transcribePy.includes('WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")'),
    );
    assert.ok(!transcribePy.includes('WhisperModel("small"'));
  });

  it('ImportError install hint leads with uv', () => {
    assert.match(transcribePy, /except ImportError:/);
    const uvHint = 'uv pip install faster-whisper';
    const uvAt = transcribePy.indexOf(uvHint);
    const fallbackAt = transcribePy.indexOf('--break-system-packages');
    assert.ok(uvAt !== -1, 'missing uv pip install faster-whisper');
    assert.ok(fallbackAt !== -1, 'missing --break-system-packages fallback');
    assert.ok(uvAt < fallbackAt, 'uv pip install faster-whisper must lead');
  });
});

