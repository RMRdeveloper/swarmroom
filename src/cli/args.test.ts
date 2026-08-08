import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatHelp, parseArgs } from './args.ts';

describe('parseArgs', () => {
  it('returns help for --help and -h', () => {
    assert.equal(parseArgs(['--help']).kind, 'help');
    assert.equal(parseArgs(['-h']).kind, 'help');
  });

  it('returns version for --version and -V', () => {
    assert.equal(parseArgs(['--version']).kind, 'version');
    assert.equal(parseArgs(['-V']).kind, 'version');
  });

  it('defaults verbose and quiet to false', () => {
    const parsed = parseArgs(['--cursor']);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.equal(parsed.options.verbose, false);
    assert.equal(parsed.options.quiet, false);
  });

  it('parses --verbose and -v', () => {
    for (const flag of ['--verbose', '-v'] as const) {
      const parsed = parseArgs([flag, '--cursor']);
      assert.equal(parsed.kind, 'ok');
      if (parsed.kind !== 'ok') return;
      assert.equal(parsed.options.verbose, true);
      assert.equal(parsed.options.quiet, false);
    }
  });

  it('parses --quiet and -q', () => {
    for (const flag of ['--quiet', '-q'] as const) {
      const parsed = parseArgs([flag, '--cursor']);
      assert.equal(parsed.kind, 'ok');
      if (parsed.kind !== 'ok') return;
      assert.equal(parsed.options.quiet, true);
      assert.equal(parsed.options.verbose, false);
    }
  });

  it('errors when both verbose and quiet are set', () => {
    const parsed = parseArgs(['--verbose', '--quiet']);
    assert.equal(parsed.kind, 'error');
    if (parsed.kind !== 'error') return;
    assert.match(parsed.message, /cannot be used together/);
    assert.match(parsed.message, /--help/);
  });

  it('errors on unknown flag', () => {
    const parsed = parseArgs(['--nope']);
    assert.equal(parsed.kind, 'error');
    if (parsed.kind !== 'error') return;
    assert.match(parsed.message, /unknown option: --nope/);
  });

  it('errors when --dir is missing a path', () => {
    const missing = parseArgs(['--dir']);
    assert.equal(missing.kind, 'error');
    if (missing.kind !== 'error') return;
    assert.match(missing.message, /--dir requires a path/);

    const flagAsPath = parseArgs(['--dir', '--force']);
    assert.equal(flagAsPath.kind, 'error');
  });

  it('formatHelp mentions verbose and quiet', () => {
    const help = formatHelp();
    assert.match(help, /--verbose/);
    assert.match(help, /--quiet/);
    assert.match(help, /cannot be used together/);
  });

  it('parses the tasks command', () => {
    const parsed = parseArgs(['tasks']);
    assert.equal(parsed.kind, 'tasks');
    if (parsed.kind !== 'tasks') return;
    assert.equal(parsed.json, false);
    assert.ok(parsed.dir.length > 0);
  });

  it('parses tasks --json and --dir', () => {
    const json = parseArgs(['tasks', '--json']);
    assert.equal(json.kind, 'tasks');
    if (json.kind !== 'tasks') return;
    assert.equal(json.json, true);

    const withDir = parseArgs(['tasks', '--dir', '/tmp/x']);
    assert.equal(withDir.kind, 'tasks');
    if (withDir.kind !== 'tasks') return;
    assert.equal(withDir.dir, '/tmp/x');
    assert.equal(withDir.json, false);
  });

  it('rejects --json outside tasks', () => {
    const parsed = parseArgs(['--json']);
    assert.equal(parsed.kind, 'error');
    if (parsed.kind !== 'error') return;
    assert.match(parsed.message, /unknown option: --json/);
  });

  it('rejects unknown positionals including status', () => {
    const status = parseArgs(['status']);
    assert.equal(status.kind, 'error');
    if (status.kind !== 'error') return;
    assert.match(status.message, /unknown option: status/);

    const nope = parseArgs(['nope']);
    assert.equal(nope.kind, 'error');
    if (nope.kind !== 'error') return;
    assert.match(nope.message, /unknown option: nope/);
  });

  it('formatHelp mentions swarmroom tasks', () => {
    assert.match(formatHelp(), /swarmroom tasks/);
  });

  it('parses --codex', () => {
    const parsed = parseArgs(['--codex']);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.equal(parsed.options.chosen.length, 1);
    assert.equal(parsed.options.chosen[0]?.id, 'codex');
    assert.equal(parsed.options.explicit, true);
  });

  it('formatHelp mentions --codex', () => {
    assert.match(formatHelp(), /--codex/);
  });

  it('defaults to all targets including cursor and codex', () => {
    const parsed = parseArgs([]);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    const ids = parsed.options.chosen.map((t) => t.id);
    assert.ok(ids.includes('codex'));
    assert.ok(ids.includes('cursor'));
  });
});
