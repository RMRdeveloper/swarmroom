import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('task CLI errors', () => {
  it('reports missing graph via stderr with new format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-cli-'));
    await assert.rejects(
      execFileAsync(process.execPath, [
        'src/cli.ts',
        'tasks',
        '--tasks-file',
        'run.tasks',
        'ready',
        '--dir',
        dir,
      ]),
      (error: unknown) => {
        const commandError = error as { readonly stdout: string; readonly stderr: string };
        assert.match(
          commandError.stderr,
          new RegExp(`No task graph at ${join(dir, '.swarmroom', 'tasks', 'run.tasks')}`),
        );
        return true;
      },
    );
  });

  it('rejects unknown --json flag', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-cli-'));
    await assert.rejects(
      execFileAsync(process.execPath, [
        'src/cli.ts',
        'tasks',
        '--tasks-file',
        'run.tasks',
        '--json',
        '--dir',
        dir,
      ]),
      (error: unknown) => {
        const commandError = error as { readonly stdout: string; readonly stderr: string };
        assert.match(commandError.stderr, /unknown option: --json/);
        return true;
      },
    );
  });
});
