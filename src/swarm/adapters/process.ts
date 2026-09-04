/** Minimal subprocess port. Inner logic depends on this shape, never on node:child_process. */
export interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one CLI command and resolves with its captured output. */
export interface CommandRunner {
  run(options: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
  }): Promise<SpawnResult>;
}
