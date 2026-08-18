import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { skills } from '../domain/pipeline.ts';
import { targets } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pipelineSkill = readFileSync(join(here, 'skills', 'sw-pipeline', 'SKILL.md'), 'utf8');
const specSkill = readFileSync(join(here, 'skills', 'sw-spec', 'SKILL.md'), 'utf8');
const grillingSkill = readFileSync(join(here, 'skills', 'sw-grilling', 'SKILL.md'), 'utf8');
const transcribeDir = join(here, 'skills', 'sw-transcribe-audio');
const transcribeSkill = readFileSync(join(transcribeDir, 'SKILL.md'), 'utf8');
const transcribePy = readFileSync(join(transcribeDir, 'transcribe.py'), 'utf8');

const FINDING_LINE =
  '`FINDING <N> | <Critical|High|Medium> | <file:line> | <rule> | <description>`';

const PRECEDENCE =
  'Task instructions may narrow scope, files, and acceptance checks for this run; they do not override repo docs (`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present) or the baseline standards those docs leave in force.';

function markdownSection(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.ok(start !== -1, `missing ${heading}`);
  const afterHeading = start + heading.length;
  const nextHeading = markdown.indexOf('\n## ', afterHeading);
  if (nextHeading === -1) return markdown.slice(afterHeading);
  return markdown.slice(afterHeading, nextHeading);
}

describe('sw-pipeline skill', () => {
  it('delegates to the six pipeline agents', () => {
    for (const name of [
      'sw-planner',
      'sw-implementer',
      'sw-critic',
      'sw-code-reviewer',
      'sw-verifier',
      'sw-fixer',
    ]) {
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

  it('runs the interactive grilling gate before the planner', () => {
    assert.match(pipelineSkill, /## Interactive gate: sw-grilling/);
    assert.match(pipelineSkill, /No `sw-planner`, no `sw-grilling`/);
    assert.match(pipelineSkill, /run `sw-grilling` directly/);
    assert.match(pipelineSkill, /pause/);
    assert.match(pipelineSkill, /recommended/);
    assert.match(pipelineSkill, /do not start `sw-planner`/);
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

  it('prefixes every skill with sw- to avoid clashing with user skills', () => {
    for (const name of skills) {
      assert.ok(name.startsWith('sw-'), `${name} must start with sw-`);
    }
  });
});

describe('sw-spec skill', () => {
  it('has valid frontmatter', () => {
    const [before, frontmatter] = specSkill.split('---');
    assert.equal(before, '');
    assert.ok(frontmatter);
    assert.match(frontmatter, /name:\s*sw-spec/);
    assert.match(frontmatter, /description:\s*\S/);
    assert.match(frontmatter, /argument-hint:/);
    assert.match(frontmatter, /disable-model-invocation:/);
  });

  it('stores specs under docs/specs in the target project root', () => {
    assert.match(specSkill, /docs\/specs\//);
    assert.match(specSkill, /target project root/);
  });

  it('resolves the target project root explicitly', () => {
    assert.match(specSkill, /Resolve the root of the \*\*target\*\* project/);
    assert.match(specSkill, /ambiguous/);
    assert.match(specSkill, /stop and ask/);
  });

  it('does not overwrite or auto-suffix existing specs', () => {
    assert.match(specSkill, /already exists, stop/);
    assert.match(specSkill, /do not overwrite silently/);
    assert.match(specSkill, /do not\n?auto-suffix/);
    assert.match(specSkill, /confirm an update or pick another/);
  });

  it('writes plain markdown in the request language with the agreed sections', () => {
    assert.match(specSkill, /plain Markdown, no frontmatter/);
    assert.match(specSkill, /language of the user's request/);
    for (const section of [
      '## Context',
      '## Goal',
      '## Non-goals',
      '## Requirements',
      '## Acceptance Criteria',
      '## Constraints',
      '## Open Questions',
    ]) {
      assert.ok(specSkill.includes(section), `missing ${section}`);
    }
  });

  it('uses Given/When/Then acceptance criteria', () => {
    assert.match(specSkill, /Given <precondition>/);
    assert.match(specSkill, /When <action>/);
    assert.match(specSkill, /Then <observable result>/);
  });

  it('confirms the draft and destination before writing', () => {
    assert.match(specSkill, /Show the complete draft/);
    assert.match(specSkill, /exact destination path/);
    assert.match(specSkill, /after explicit user confirmation/);
  });

  it('limits writes to docs/specs and never touches code or tasks', () => {
    assert.match(specSkill, /only file this skill may create or update/);
    assert.match(specSkill, /Do not touch code, other documentation/);
    assert.match(specSkill, /\.swarmroom\/tasks\.json/);
  });

  it('hands off to sw-pipeline without running it', () => {
    assert.match(specSkill, /`\/sw-pipeline`/);
    assert.match(specSkill, /suggest the next step/);
    assert.ok(!/run the sw-\\\* pipeline/i.test(specSkill));
  });

  it('survives rewriteSkill for every target', () => {
    for (const target of targets) {
      const rewritten = target.rewriteSkill(specSkill);
      assert.ok(!rewritten.includes('\n\n\n'), `${target.id}: triple newlines`);
      assert.ok(rewritten.includes('docs/specs/'), `${target.id}: lost docs/specs`);
      assert.ok(rewritten.includes('sw-pipeline'), `${target.id}: lost handoff`);
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

describe('sw-grilling skill', () => {
  it('caps each round at 3 and does not dump the frontier', () => {
    assert.match(grillingSkill, /at most \*\*3\*\*/);
    assert.match(grillingSkill, /never dump/i);
    assert.ok(!/ask the whole frontier/i.test(grillingSkill));
  });

  it('numbers questions continuously across rounds', () => {
    assert.match(grillingSkill, /continuously across rounds/i);
    assert.match(grillingSkill, /never restart at 1/i);
  });

  it('accepts go with recommended for the current round', () => {
    assert.ok(grillingSkill.includes('go with recommended'));
  });

  it('distinguishes frontier from batch and keeps asked set independent', () => {
    assert.match(grillingSkill, /batch.*frontier|frontier.*batch/is);
    assert.match(grillingSkill, /independent/i);
  });
});

describe('sw-transcribe-audio skill', () => {
  it('has valid frontmatter', () => {
    const [before, frontmatter] = transcribeSkill.split('---');
    assert.equal(before, '');
    assert.ok(frontmatter);
    assert.match(frontmatter, /name:\s*sw-transcribe-audio/);
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
    const setup = markdownSection(transcribeSkill, '## Python dependency setup');
    const requirements = markdownSection(transcribeSkill, '## Requirements');
    assert.match(setup, /uv pip install faster-whisper/);
    assert.match(setup, /uv add faster-whisper/);
    assert.match(setup, /pip install uv/);
    assert.match(setup, /last resort/);
    assert.match(setup, /--break-system-packages/);
    assert.match(setup, /not agent actions/);
    assert.match(setup, /Do not run them/);
    assert.ok(
      !requirements.includes('uv pip install'),
      'Requirements must not command uv pip install',
    );
  });

  it('How to run contains exactly the canonical uv run --with invoke', () => {
    const howToRun = markdownSection(transcribeSkill, '## How to run');
    assert.ok(howToRun.includes('uv run --with faster-whisper python3 transcribe.py'));
    const fenced = howToRun.match(/```\n([\s\S]*?)\n```/);
    assert.ok(fenced?.[1], 'missing How to run fenced command');
    assert.equal(fenced[1], 'uv run --with faster-whisper python3 transcribe.py <audio_path>');
    assert.ok(
      howToRun.includes(
        'Do not run `python3 transcribe.py` directly or install `faster-whisper` separately',
      ),
    );
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

  it('ImportError points at uv run --with faster-whisper, not uv pip install', () => {
    assert.match(transcribePy, /except ImportError:/);
    assert.ok(
      transcribePy.includes(
        'This script must be invoked with: uv run --with faster-whisper python3 transcribe.py <audio_path>.',
      ),
      'ImportError must name the canonical invoke',
    );
    assert.ok(!transcribePy.includes('uv pip install'), 'ImportError must not suggest uv pip install');
  });

  it('usage string is the canonical uv run --with invoke', () => {
    assert.ok(transcribePy.includes('usage: uv run --with faster-whisper python3 transcribe.py <audio_path>'));
  });
});

