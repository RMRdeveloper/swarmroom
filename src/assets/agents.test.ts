import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { agents } from '../domain/pipeline.ts';
import { targets } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(here, 'agents');
const guidelinesPath = join(here, 'artifacts', 'CODING_GUIDELINES.md');

/** Pipeline agents that share Block A + Block B (excludes researchers). */
const RESEARCH_AGENTS = ['sw-researcher', 'sw-web-researcher'] as const;
const READ_FIRST_AGENTS = [
  'sw-planner',
  'sw-implementer',
  'sw-code-reviewer',
  'sw-verifier',
  'sw-fixer',
] as const;

const FINDINGS_AGENTS = ['sw-code-reviewer', 'sw-verifier', 'sw-fixer'] as const;

const COMMAND_DETECT_AGENTS = ['sw-planner', 'sw-implementer', 'sw-verifier', 'sw-fixer'] as const;

const GRILLING_OWNER =
  'For non-trivial work, if a `grilling` skill is available, run it first and let its shared understanding shape the plan. You are the only stage that runs it.';

const GRILLING_STANDALONE =
  '`sw-planner` owns `grilling`. Run it yourself only if you were invoked standalone, with no prior plan, on non-trivial work — never a second time inside a pipeline run.';

const SENTENCE_D =
  "Detect the repo's test and lint commands from its own manifest or task runner — for example `package.json` scripts, `composer.json`, a `Makefile`, `justfile`, `pyproject.toml`, or the CI workflow — instead of assuming a stack. If no command is discoverable, say so instead of inventing one.";

const FORBIDDEN_PREFIX = /^(readonly:|model:|argument-hint:|disable-model-invocation:)/;

function agentPath(name: string): string {
  return join(agentsDir, `${name}.md`);
}

function readAgent(name: string): string {
  return readFileSync(agentPath(name), 'utf8');
}

/** Extract the body under `## heading` until the next `## ` or EOF. */
function section(source: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing section ## ${heading}`);
  const after = start + marker.length;
  const next = source.indexOf('\n## ', after);
  const body = next < 0 ? source.slice(after) : source.slice(after, next);
  return body.replace(/^\n+/, '').replace(/\n+$/, '');
}

/** Bullet lines (`- …`) inside a section body. */
function bullets(sectionText: string): string[] {
  return sectionText
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.startsWith('- '));
}

/**
 * Contiguous block starting at `## heading` and ending at `endMarker` (inclusive).
 * Used for shared blocks that may be followed by agent-specific prose before the next heading.
 */
function blockThrough(source: string, heading: string, endMarker: string): string {
  const start = source.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `missing ## ${heading}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end >= 0, `missing end marker in ## ${heading}`);
  return source.slice(start, end + endMarker.length);
}

/** Do-cell text from the Quick reference table in CODING_GUIDELINES.md. */
function quickReferenceDoCells(): string[] {
  const source = readFileSync(guidelinesPath, 'utf8');
  const lines = source.split('\n');
  const cells: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('| Do ')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) break;
    if (/^\|\s*-+/.test(line)) continue;
    const match = /^\|\s*(.*?)\s*\|/.exec(line);
    assert.ok(match, `unparseable Quick reference row: ${line}`);
    cells.push(match[1]!.trim());
  }
  assert.equal(cells.length, 20, `expected 20 Quick reference Do cells, got ${cells.length}`);
  return cells;
}

function assertSharedBlockHygiene(block: string, label: string): void {
  for (const line of block.split('\n')) {
    assert.ok(!FORBIDDEN_PREFIX.test(line.trim()), `${label}: forbidden frontmatter prefix in shared block: ${line}`);
  }
  assert.ok(!block.includes('\n\n\n'), `${label}: shared block contains three consecutive newlines`);
}

function assertIdenticalBlocks(blocks: readonly string[], label: string): string {
  assert.ok(blocks.length >= 2, `${label}: need at least two blocks`);
  const first = blocks[0]!;
  for (let i = 1; i < blocks.length; i++) {
    assert.equal(blocks[i], first, `${label}: drift between block[0] and block[${i}]`);
  }
  assertSharedBlockHygiene(first, label);
  return first;
}

function assertAgentSurvivesRewrites(name: string, source: string): void {
  for (const target of targets) {
    const rewritten = target.rewriteAgent(source);
    assert.match(rewritten, /^description:/m, `${name}@${target.id}: rewritten source must keep description:`);
    assert.ok(!rewritten.includes('\n\n\n'), `${name}@${target.id}: rewritten source has three consecutive newlines`);
    if (target.id === 'opencode' || target.id === 'claude') {
      assert.match(rewritten, /^mode: subagent$/m, `${name}@${target.id}: expected mode: subagent`);
    }
  }
}

const READ_FIRST_END =
  'If any of these is missing, say so explicitly instead of assuming there are no constraints. When present, they override the baseline below.';

const BASELINE_END = '- Comments only for important non-obvious intent — no narration, no noise, no stale TODOs.';

const FINDINGS_END =
  'Severity: Critical = must fix before merge; High = fix soon; Medium = address when possible. `rule` names the violated guideline.';

describe('agent prompt assets', () => {
  const byName = Object.fromEntries(agents.map((name) => [name, readAgent(name)])) as Record<string, string>;

  it('keeps read-first identical across the five pipeline agents', () => {
    const blocks = READ_FIRST_AGENTS.map((n) =>
      blockThrough(byName[n]!, 'Mandatory read-first (never skip, docs change)', READ_FIRST_END),
    );
    assertIdenticalBlocks(blocks, 'read-first');
  });

  it('keeps baseline identical across the five pipeline agents', () => {
    const blocks = READ_FIRST_AGENTS.map((n) =>
      blockThrough(byName[n]!, 'Baseline standards (apply when the repo defines nothing stricter)', BASELINE_END),
    );
    assertIdenticalBlocks(blocks, 'baseline');
  });

  it('gives research agents no Baseline standards section', () => {
    for (const name of RESEARCH_AGENTS) {
      assert.ok(!byName[name]!.includes('## Baseline standards'), `${name} must not have Baseline`);
    }
  });

  it('aligns baseline bullets with Quick reference Do cells', () => {
    const doCells = quickReferenceDoCells();
    const baselineBody = section(byName['sw-planner']!, 'Baseline standards (apply when the repo defines nothing stricter)');
    const list = bullets(baselineBody);
    assert.equal(list.length, doCells.length);
    for (let i = 0; i < doCells.length; i++) {
      assert.ok(
        list[i]!.startsWith(`- ${doCells[i]} —`),
        `baseline bullet ${i} must start with "- ${doCells[i]} —"; got: ${list[i]}`,
      );
    }
  });

  it('encodes grilling ownership correctly', () => {
    assert.ok(byName['sw-planner']!.includes(GRILLING_OWNER));
    assert.ok(byName['sw-implementer']!.includes(GRILLING_STANDALONE));
    assert.ok(byName['sw-fixer']!.includes(GRILLING_STANDALONE));
    const fromImpl = byName['sw-implementer']!.slice(
      byName['sw-implementer']!.indexOf(GRILLING_STANDALONE),
      byName['sw-implementer']!.indexOf(GRILLING_STANDALONE) + GRILLING_STANDALONE.length,
    );
    const fromFixer = byName['sw-fixer']!.slice(
      byName['sw-fixer']!.indexOf(GRILLING_STANDALONE),
      byName['sw-fixer']!.indexOf(GRILLING_STANDALONE) + GRILLING_STANDALONE.length,
    );
    assert.equal(fromImpl, fromFixer);
    for (const name of ['sw-code-reviewer', 'sw-verifier', ...RESEARCH_AGENTS] as const) {
      assert.ok(!byName[name]!.toLowerCase().includes('grilling'), `${name} must not mention grilling`);
    }
  });

  it('uses Sentence D for command detection and forbids npm hardcodes', () => {
    for (const name of COMMAND_DETECT_AGENTS) {
      assert.ok(byName[name]!.includes(SENTENCE_D), `${name} must contain Sentence D`);
    }
    for (const name of agents) {
      assert.ok(!byName[name]!.includes('npm test'), `${name} must not contain "npm test"`);
      assert.ok(!byName[name]!.includes('npm run lint'), `${name} must not contain "npm run lint"`);
    }
  });

  it('keeps findings contract identical across reviewer, verifier, fixer', () => {
    const blocks = FINDINGS_AGENTS.map((n) =>
      blockThrough(byName[n]!, 'Findings contract (one line per finding)', FINDINGS_END),
    );
    assertIdenticalBlocks(blocks, 'findings');
  });

  it('survives dropToBase and subagent rewrites', () => {
    for (const name of agents) {
      assertAgentSurvivesRewrites(name, byName[name]!);
    }

    const readFirstRaw = blockThrough(
      byName['sw-planner']!,
      'Mandatory read-first (never skip, docs change)',
      READ_FIRST_END,
    );
    const baselineRaw = blockThrough(
      byName['sw-planner']!,
      'Baseline standards (apply when the repo defines nothing stricter)',
      BASELINE_END,
    );
    const findingsRaw = blockThrough(
      byName['sw-code-reviewer']!,
      'Findings contract (one line per finding)',
      FINDINGS_END,
    );

    assertSharedBlockHygiene(readFirstRaw, 'read-first raw');
    assertSharedBlockHygiene(baselineRaw, 'baseline raw');
    assertSharedBlockHygiene(findingsRaw, 'findings raw');

    for (const target of targets) {
      for (const name of READ_FIRST_AGENTS) {
        const rewritten = target.rewriteAgent(byName[name]!);
        assert.equal(
          blockThrough(rewritten, 'Mandatory read-first (never skip, docs change)', READ_FIRST_END),
          readFirstRaw,
        );
        assert.equal(
          blockThrough(rewritten, 'Baseline standards (apply when the repo defines nothing stricter)', BASELINE_END),
          baselineRaw,
        );
      }
      for (const name of FINDINGS_AGENTS) {
        const rewritten = target.rewriteAgent(byName[name]!);
        assert.equal(
          blockThrough(rewritten, 'Findings contract (one line per finding)', FINDINGS_END),
          findingsRaw,
        );
      }
    }
  });
});
