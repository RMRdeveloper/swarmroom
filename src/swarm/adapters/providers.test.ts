/** Tests for harness provider argv, gate answers, and runtime wiring. No subprocesses run. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { trivialConfirmQuestion } from '../harness.ts';

import { askOptions, type LineReader } from './gate.ts';
import { createOpencodeModelProvider } from './opencode.ts';
import { createPiModelProvider } from './pi.ts';
import type { CommandRunner, SpawnResult } from './process.ts';
import { createSwarmRuntime } from './wiring.ts';

/** Scripted runner: records calls, replays canned stdout per command. */
class FakeRunner implements CommandRunner {
  readonly calls: { command: string; args: readonly string[]; cwd: string }[] = [];
  private readonly outputs: Record<string, string>;
  constructor(outputs: Record<string, string>) {
    this.outputs = outputs;
  }

  run(options: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
  }): Promise<SpawnResult> {
    this.calls.push({ command: options.command, args: options.args, cwd: options.cwd });
    const stdout = this.outputs[options.command] ?? '';
    return Promise.resolve({ stdout, stderr: '' });
  }
}

/** Scripted line reader for gate answers. */
function scriptedReader(answers: readonly string[]): LineReader {
  let index = 0;
  const closed: boolean[] = [];
  return {
    question(): Promise<string> {
      const answer = answers[index] ?? '';
      index += 1;
      return Promise.resolve(answer);
    },
    close(): void {
      closed.push(true);
    },
  };
}

describe('opencode provider', () => {
  it('spawns opencode run with prompt last and parses text parts', async () => {
    const runner = new FakeRunner({
      opencode: String.raw`{"type":"text","part":{"id":"a","type":"text","text":"{\"plan\":\"p\",\"tasks\":[],\"verification\":[]}"}}`,
    });
    const model = createOpencodeModelProvider({ dir: '/repo', runner });
    const result = await model.generate<{ plan: string }>({
      instructions: 'Plan.',
      input: { request: 'x' },
    });
    assert.deepEqual(result, { plan: 'p', tasks: [], verification: [] });
    assert.equal(runner.calls.length, 1);
    const call = runner.calls[0];
    assert.equal(call?.command, 'opencode');
    assert.deepEqual(call?.args.slice(0, 4), ['run', '--format', 'json', '--dir']);
    assert.match(call?.args.at(-1) ?? '', /Plan\./);
    assert.equal(call?.cwd, '/repo');
  });

  it('forwards model override and auto-approve only when set', async () => {
    const runner = new FakeRunner({ opencode: '{"a":1}' });
    const model = createOpencodeModelProvider({
      dir: '/repo',
      model: 'anthropic/claude',
      autoApprove: true,
      runner,
    });
    await model.generate({ instructions: 'i', input: {} });
    const args = runner.calls[0]?.args ?? [];
    assert.ok(args.includes('-m') && args.includes('anthropic/claude'));
    assert.ok(args.includes('--auto'));
  });

  it('fails fast without a runner or dir', () => {
    assert.throws(() => createOpencodeModelProvider({ dir: '  ' }), /target dir/);
    const model = createOpencodeModelProvider({ dir: '/repo' });
    assert.rejects(model.generate({ instructions: 'i', input: {} }), /needs a runner/);
  });
});

describe('pi provider', () => {
  it('spawns pi print mode and parses deltas', async () => {
    const runner = new FakeRunner({
      pi: '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"[1,2]"}}',
    });
    const model = createPiModelProvider({ dir: '/repo', runner });
    const result = await model.generate<number[]>({ instructions: 'List.', input: {} });
    assert.deepEqual(result, [1, 2]);
    const call = runner.calls[0];
    assert.equal(call?.command, 'pi');
    assert.deepEqual(call?.args.slice(0, 4), ['-p', '--no-session', '--mode', 'json']);
    assert.equal(call?.args.at(-2), '--');
  });

  it('forwards model override and project trust only when set', async () => {
    const runner = new FakeRunner({
      pi: String.raw`{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"\"ok\""}]}}`,
    });
    const model = createPiModelProvider({
      dir: '/repo',
      model: 'anthropic/claude-sonnet',
      approveProjectFiles: true,
      runner,
    });
    await model.generate({ instructions: 'i', input: {} });
    const args = runner.calls[0]?.args ?? [];
    assert.ok(args.includes('--model') && args.includes('anthropic/claude-sonnet'));
    assert.ok(args.includes('-a'));
  });

  it('fails fast without a runner or dir', () => {
    assert.throws(() => createPiModelProvider({ dir: '' }), /target dir/);
    const model = createPiModelProvider({ dir: '/repo' });
    assert.rejects(model.generate({ instructions: 'i', input: {} }), /needs a runner/);
  });
});

describe('askOptions', () => {
  it('maps numbers to option labels and passes free text through', async () => {
    const question = trivialConfirmQuestion();
    assert.equal(await askOptions(scriptedReader(['1']), question), 'Non-trivial (Recommended)');
    assert.equal(await askOptions(scriptedReader(['2']), question), 'Trivial');
    assert.equal(
      await askOptions(scriptedReader(['go with recommended']), question),
      'go with recommended',
    );
  });

  it('reprompts on empty answers', async () => {
    const question = trivialConfirmQuestion();
    assert.equal(await askOptions(scriptedReader(['', '  ', '2']), question), 'Trivial');
  });
});

describe('createSwarmRuntime', () => {
  it('wires one provider per harness with gate and agents', () => {
    const opencode = createSwarmRuntime({
      harness: 'opencode',
      dir: '/repo',
      runner: new FakeRunner({}),
    });
    const pi = createSwarmRuntime({ harness: 'pi', dir: '/repo', runner: new FakeRunner({}) });
    assert.equal(opencode.gate.harness, 'opencode');
    assert.equal(pi.gate.harness, 'pi');
    assert.equal(opencode.planner.id, 'sw-planner');
    assert.equal(pi.fixer.id, 'sw-fixer');
  });
});
