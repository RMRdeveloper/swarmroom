/** Node implementation of the subprocess port using spawn. */
import { spawn } from 'node:child_process';

import type { CommandRunner, SpawnResult } from './process.ts';

const BUFFER_LIMIT = 10 * 1024 * 1024;

/** Append while under the cap so one huge output cannot exhaust memory. */
function appendCapped(current: string, chunk: string): string {
  if (current.length >= BUFFER_LIMIT) return current;
  return (current + chunk).slice(0, BUFFER_LIMIT);
}

/** Runs harness CLIs with stdin ignored so piped input never leaks into prompts. */
export function createNodeCommandRunner(): CommandRunner {
  return {
    run(options: {
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly timeoutMs: number;
    }): Promise<SpawnResult> {
      return new Promise<SpawnResult>((resolve, reject) => {
        const child = spawn(options.command, [...options.args], {
          cwd: options.cwd,
          timeout: options.timeoutMs,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdout = appendCapped(stdout, chunk.toString('utf8'));
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr = appendCapped(stderr, chunk.toString('utf8'));
        });
        child.on('error', (error: Error) => {
          reject(new Error(`command failed to start: ${options.command}: ${error.message}`));
        });
        child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          if (code === 0) {
            resolve({ stdout, stderr });
            return;
          }
          const reason = signal === null ? `exit ${String(code)}` : `signal ${signal}`;
          /** Harness CLIs may print partial JSON events to stdout before failing. */
          const detail = [stdout.slice(-500), stderr.slice(-500)]
            .filter((part) => part.length > 0)
            .join('\n');
          reject(
            new Error(
              `command failed: ${options.command} ${reason}${detail.length > 0 ? ` (output: ${detail})` : ''}`,
            ),
          );
        });
      });
    },
  };
}
