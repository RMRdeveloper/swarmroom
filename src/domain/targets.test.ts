import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { scopeRoot, scopeSkillsRoot, targets, type Target, type TargetId } from './targets.ts';

function targetById(id: TargetId): Target {
  const found = targets.find((t) => t.id === id);
  if (!found) throw new Error(`missing target: ${id}`);
  return found;
}

const SAMPLE_AGENT = `---
name: sw-planner
description: Planning specialist.
model: inherit
readonly: true
---

You are a senior planning engineer.

Do not write code.
`;

const SAMPLE_SKILL = `---
name: sw-pipeline
description: Run the pipeline.
argument-hint: Describe the feature.
disable-model-invocation: true
---

Run the sw-* pipeline.
`;

describe('targets', () => {
  it('includes a Codex target', () => {
    assert.ok(targets.some((t) => t.id === 'codex'));
  });

  it('scopeRoot and scopeSkillsRoot match official Codex paths', () => {
    const codex = targetById('codex');
    const cwd = '/proj';
    assert.equal(scopeRoot(codex, 'project', cwd), join(cwd, '.codex'));
    assert.equal(scopeSkillsRoot(codex, 'project', cwd), join(cwd, '.agents'));
    assert.equal(scopeRoot(codex, 'global', cwd), join(homedir(), '.codex'));
    assert.equal(scopeSkillsRoot(codex, 'global', cwd), join(homedir(), '.agents'));
  });

  it('keeps cursor skills dest equal to agent dest', () => {
    const cursor = targetById('cursor');
    const cwd = '/proj';
    assert.equal(scopeSkillsRoot(cursor, 'project', cwd), scopeRoot(cursor, 'project', cwd));
    assert.equal(scopeSkillsRoot(cursor, 'global', cwd), scopeRoot(cursor, 'global', cwd));
  });

  it('rewriteAgent produces TOML with name, description, and matching body', () => {
    const toml = targetById('codex').rewriteAgent(SAMPLE_AGENT);
    assert.match(toml, /^name = "sw-planner"$/m);
    assert.match(toml, /^description = "Planning specialist\."$/m);
    assert.match(toml, /^developer_instructions = '''/m);

    const close = SAMPLE_AGENT.indexOf('\n---\n', 3);
    assert.ok(close >= 0);
    const sourceBody = SAMPLE_AGENT.slice(close + '\n---\n'.length).trim();
    const encoded = toml.match(/developer_instructions = '''([\s\S]*)'''/);
    assert.ok(encoded);
    assert.equal(encoded[1], sourceBody);

    assert.ok(!/sandbox/i.test(toml));
    assert.ok(!/\bmodel\b/i.test(toml));
    assert.ok(!/approval/i.test(toml));
    assert.ok(!/readonly/i.test(toml));
  });

  it('fails fast when developer_instructions cannot be a TOML literal', () => {
    const source = `---
name: bad
description: cannot encode
---

Use ''' inside the body.
`;
    assert.throws(() => targetById('codex').rewriteAgent(source), /'''/);
  });

  it('rewriteSkill strips Cursor-only skill keys', () => {
    const rewritten = targetById('codex').rewriteSkill(SAMPLE_SKILL);
    assert.ok(!/^argument-hint:/m.test(rewritten), 'argument-hint survived');
    assert.ok(!/^disable-model-invocation:/m.test(rewritten), 'disable-model-invocation survived');
    assert.match(rewritten, /^name:/m);
    assert.match(rewritten, /^description:/m);
    assert.ok(rewritten.includes('Run the sw-* pipeline.'));
  });
});
