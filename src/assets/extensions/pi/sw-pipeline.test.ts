/** Tests for the Pi /sw-pipeline in-chat launcher. No processes, no env. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import swPipelineExtension, {
  buildPipelineMessage,
  createPipelineHandler,
  parsePipelineArgs,
  resolveSkillPath,
} from './sw-pipeline.ts';

const FILE_URL = 'file:///repo/.pi/extensions/sw-pipeline.ts';

describe('parsePipelineArgs', () => {
  it('parses request plus model', () => {
    assert.deepEqual(parsePipelineArgs('--model m Fix the typo'), {
      request: 'Fix the typo',
      model: 'm',
    });
  });

  it('defaults model when absent', () => {
    assert.deepEqual(parsePipelineArgs('Add auth'), { request: 'Add auth' });
  });

  it('rejects empty requests, missing values, and unknown flags', () => {
    assert.throws(() => parsePipelineArgs(' '.repeat(3)), /missing request/);
    assert.throws(() => parsePipelineArgs('--model'), /--model requires a value/);
    assert.throws(() => parsePipelineArgs('--nope do x'), /unknown option/);
  });
});

describe('resolveSkillPath', () => {
  it('prefers the installed .pi/skills copy first', () => {
    const seen: string[] = [];
    const path = resolveSkillPath(FILE_URL, (candidate: string) => {
      seen.push(candidate);
      return true;
    });
    assert.ok(path.endsWith('.pi/skills/sw-pipeline/SKILL.md'));
    assert.equal(seen.length, 1);
  });

  it('falls back to the source checkout layouts in order', () => {
    let calls = 0;
    const path = resolveSkillPath(FILE_URL, () => {
      calls += 1;
      return calls === 3;
    });
    assert.ok(path.endsWith('src/assets/skills/sw-pipeline/SKILL.md'));
    assert.equal(calls, 3);
  });

  it('throws when neither skill copy exists', () => {
    assert.throws(() => resolveSkillPath(FILE_URL, () => false), /skill not found/);
  });
});

describe('buildPipelineMessage', () => {
  it('builds the in-chat launcher text', () => {
    assert.equal(
      buildPipelineMessage({ skillPath: '/skills/SKILL.md', cwd: '/repo', request: 'Add auth' }),
      'Follow the sw-pipeline skill at /skills/SKILL.md for this request: Add auth. Project dir: /repo. Harness: pi.',
    );
    assert.equal(
      buildPipelineMessage({
        skillPath: '/skills/SKILL.md',
        cwd: '/repo',
        request: 'Add auth',
        model: 'm',
      }),
      'Follow the sw-pipeline skill at /skills/SKILL.md for this request: Add auth. Project dir: /repo. Harness: pi --model m.',
    );
  });
});

describe('pipeline handler', () => {
  it('registers the sw-pipeline command', () => {
    const names: string[] = [];
    const sent: string[] = [];
    swPipelineExtension({
      registerCommand(name: string): void {
        names.push(name);
      },
      sendUserMessage(text: string): Promise<void> {
        sent.push(text);
        return Promise.resolve();
      },
    });
    assert.deepEqual(names, ['sw-pipeline']);
  });

  it('sends exactly one launcher message', async () => {
    const sent: string[] = [];
    const handler = createPipelineHandler({
      fileUrl: FILE_URL,
      exists: () => true,
      sendUserMessage(text: string): Promise<void> {
        sent.push(text);
        return Promise.resolve();
      },
    });
    await handler('--model m Add auth', { cwd: '/repo' });
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? '', /Follow the sw-pipeline skill at .*SKILL\.md/);
    assert.match(sent[0] ?? '', /Add auth/);
    assert.match(sent[0] ?? '', /Project dir: \/repo/);
    assert.match(sent[0] ?? '', /Harness: pi --model m/);
  });

  it('propagates a busy session as a clear error', async () => {
    const handler = createPipelineHandler({
      fileUrl: FILE_URL,
      exists: () => true,
      sendUserMessage(): Promise<void> {
        return Promise.reject(new Error('session is busy'));
      },
    });
    await assert.rejects(handler('Add auth', { cwd: '/repo' }), /busy.*retry when idle/);
  });

  it('throws when the skill file is missing', async () => {
    const handler = createPipelineHandler({
      fileUrl: FILE_URL,
      exists: () => false,
      sendUserMessage(): Promise<void> {
        return Promise.resolve();
      },
    });
    await assert.rejects(handler('Add auth', { cwd: '/repo' }), /skill not found/);
  });

  it('throws usage errors instead of sending', async () => {
    let calls = 0;
    const handler = createPipelineHandler({
      fileUrl: FILE_URL,
      exists: () => true,
      sendUserMessage(): Promise<void> {
        calls += 1;
        return Promise.resolve();
      },
    });
    await assert.rejects(handler(' '.repeat(3), { cwd: '/repo' }), /Usage/);
    assert.equal(calls, 0);
  });
});
