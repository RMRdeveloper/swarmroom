import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { getPackageRoot } from '../core/catalog.ts';
import {
  createIsolatedResourceLoader,
  createPiModelProvider,
  finalPiText,
  piToolsFor,
} from './pi.ts';

test('uses an isolated Pi session with the selected language policy', async () => {
  const calls: Array<{
    readonly systemPrompt: string;
    readonly tools: readonly string[];
  }> = [];
  const provider = createPiModelProvider({
    dir: process.cwd(),
    language: 'java',
    createSession: async (options) => {
      calls.push(options);
      return {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '{"filesChanged":["src/App.java"],"summary":"done"}',
              },
            ],
          },
        ],
        prompt: async () => undefined,
        abort: async () => undefined,
        dispose: () => undefined,
      };
    },
  });

  const result = await provider.generate<{ readonly summary: string }>({
    agent: 'sideroom-implementer',
    input: { task: 'add endpoint' },
    schema: '{ summary: string }',
  });

  assert.equal(result.summary, 'done');
  assert.match(calls[0]?.systemPrompt ?? '', /Java Coding Guidelines/);
  assert.match(
    calls[0]?.systemPrompt ?? '',
    /Mandatory write-gate enforcement/,
  );
  assert.ok(
    (calls[0]?.systemPrompt ?? '').indexOf('# Guidelines Template') <
      (calls[0]?.systemPrompt ?? '').indexOf(
        'Mandatory write-gate enforcement',
      ),
  );
  assert.ok(calls[0]?.tools.includes('write'));
  assert.match(calls[0]?.systemPrompt ?? '', /Sideroom execution boundary/);
  assert.doesNotMatch(calls[0]?.systemPrompt ?? '', /gentle-ai/);
});

test('keeps read-only roles on inspection tools', () => {
  assert.deepEqual(piToolsFor({ readonly: true }, true), [
    'read',
    'grep',
    'find',
    'ls',
  ]);
});

test('loads only the skills packaged by Sideroom', async () => {
  const loader = createIsolatedResourceLoader({
    cwd: process.cwd(),
    systemPrompt: 'test system prompt',
  });
  await loader.reload();
  assert.deepEqual(
    loader
      .getSkills()
      .skills.map((skill) => skill.name)
      .sort(),
    [
      'sideroom-critic',
      'sideroom-grilling',
      'sideroom-spec',
      'sideroom-transcribe-audio',
    ],
  );
  assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
  assert.ok(
    loader
      .getSkills()
      .skills.every((skill) =>
        skill.filePath.startsWith(path.join(getPackageRoot(), 'skills')),
      ),
  );
});

test('rejects an unavailable target directory before creating a session', () => {
  assert.throws(
    () =>
      createPiModelProvider({
        dir: `${process.cwd()}/missing-sideroom`,
        language: 'typescript',
      }),
    /Pi target directory is unavailable/,
  );
});

test('preserves an assistant error when Pi returns no text', () => {
  assert.throws(
    () =>
      finalPiText([
        {
          role: 'assistant',
          content: [],
          errorMessage: 'provider unavailable',
        },
      ]),
    /Pi assistant failed: provider unavailable/,
  );
});
