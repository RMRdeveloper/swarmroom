import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePiCommand } from './pi-command.ts';

test('parses a quoted Pi request with language and read-only options', () => {
  assert.deepEqual(
    parsePiCommand('--language python --read-only "Add retry handling"'),
    {
      kind: 'run',
      language: 'python',
      request: 'Add retry handling',
      allowWrite: false,
    },
  );
});

test('rejects malformed Pi command options', () => {
  assert.deepEqual(parsePiCommand('--language'), {
    kind: 'error',
    message: '--language requires a value',
  });
  assert.deepEqual(parsePiCommand('"unfinished'), {
    kind: 'error',
    message: 'command arguments contain an unterminated quote',
  });
});
