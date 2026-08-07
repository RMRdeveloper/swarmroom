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
});
