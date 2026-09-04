/** Tests for harness CLI output parsing and prompt building. No subprocesses run. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractJson } from './json.ts';
import { collectOpencodeText } from './opencode.ts';
import { collectPiText } from './pi.ts';
import { buildAgentPrompt } from './prompt.ts';

describe('buildAgentPrompt', () => {
  it('carries instructions, JSON input, and the schema contract', () => {
    const prompt = buildAgentPrompt({
      instructions: 'Do the thing.',
      input: { task: 'T1' },
      schemaHint: '{ ok: boolean }',
    });
    assert.match(prompt, /Do the thing\./);
    assert.match(prompt, /\{"task":"T1"\}/);
    assert.match(prompt, /\{ ok: boolean \}/);
    assert.match(prompt, /ONLY a single JSON value/);
  });
});

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it('prefers the last fenced block over surrounding prose', () => {
    const text = 'first {"a":1}\n```json\n{"b":2}\n```\ntrailing';
    assert.deepEqual(extractJson(text), { b: 2 });
  });

  it('finds a balanced span inside noisy output', () => {
    const text = 'log line\nnote {"x": [1, {"y": "} weird"}]} done';
    assert.deepEqual(extractJson(text), { x: [1, { y: '} weird' }] });
  });

  it('parses a bare JSON string payload', () => {
    assert.equal(extractJson('"No findings"'), 'No findings');
  });

  it('fails fast with output context when no JSON exists', () => {
    assert.throws(() => extractJson('just prose, no payload'), /parseable JSON/);
  });
});

describe('collectOpencodeText', () => {
  it('joins text parts and skips non-JSON lines', () => {
    const output = [
      '[skill-registry] skipping refresh',
      '{"type":"step_start","timestamp":1}',
      '{"type":"text","timestamp":1,"part":{"id":"a","type":"text","text":"hello "}}',
      String.raw`{"type":"text","timestamp":2,"part":{"id":"b","type":"text","text":"{\"ok\":true}"}}`,
      '{"type":"step_finish","timestamp":3,"part":{"type":"step-finish"}}',
    ].join('\n');
    assert.equal(collectOpencodeText(output), 'hello {"ok":true}');
  });

  it('returns empty text when no text parts exist', () => {
    assert.equal(collectOpencodeText('{"type":"step_start"}'), '');
  });
});

describe('collectPiText', () => {
  it('prefers deltas over the final message', () => {
    const output = [
      String.raw`{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":1,"delta":"{\"ok\":"}}`,
      '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":1,"delta":" true}"}}',
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"old"}]}}',
    ].join('\n');
    assert.equal(collectPiText(output), '{"ok": true}');
  });

  it('falls back to the last final assistant message', () => {
    const output = [
      '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}',
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"x"},{"type":"text","text":"No findings"}]}}',
    ].join('\n');
    assert.equal(collectPiText(output), 'No findings');
  });
});
