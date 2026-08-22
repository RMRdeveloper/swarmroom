import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

const execFileAsync = promisify(execFile);

describe('task CLI errors', () => {
  it('keeps --json task failures as one uncolored JSON document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-cli-'));
    await assert.rejects(
      execFileAsync(process.execPath, ['src/cli.ts', 'tasks', '--tasks-file', 'run.json', 'ready', '--json', '--dir', dir]),
      (error: unknown) => {
        const commandError = error as { readonly stdout: string; readonly stderr: string };
        assert.deepEqual(JSON.parse(commandError.stdout), { error: `No task graph at ${join(dir, '.swarmroom', 'tasks', 'run.json')}.` });
        assert.equal(commandError.stderr, '');
        return true;
      },
    );
  });
});
