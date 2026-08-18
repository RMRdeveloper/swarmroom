import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { targets } from '../domain/targets.ts';
import { anyPresent, install, installGuidelines } from './installer.ts';
import { assetsDir } from './package-root.ts';

const cursor = targets.find((t) => t.id === 'cursor');
assert.ok(cursor);
const codex = targets.find((t) => t.id === 'codex');
assert.ok(codex);

describe('installer', () => {
  const dirs: string[] = [];

  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-'));
    dirs.push(dir);
    return dir;
  }

  it('installs agents and skills into a temp root', async () => {
    const root = await tempDir();
    const report = await install({ target: cursor, root }, true);
    assert.ok(report.files.length > 0);
    assert.ok(report.files.every((f) => f.status === 'new'));
    const sample = report.files[0]!;
    const content = await readFile(sample.dest, 'utf8');
    assert.ok(content.length > 0);
  });

  it('skips existing files when overwrite is false', async () => {
    const root = await tempDir();
    await install({ target: cursor, root }, true);
    const second = await install({ target: cursor, root }, false);
    assert.ok(second.files.every((f) => f.status === 'skipped'));
  });

  it('updates existing files when overwrite is true', async () => {
    const root = await tempDir();
    await install({ target: cursor, root }, true);
    const second = await install({ target: cursor, root }, true);
    assert.ok(second.files.every((f) => f.status === 'updated'));
  });

  it('installGuidelines skips vs overwrites', async () => {
    const project = await tempDir();
    const first = await installGuidelines(project, false);
    assert.equal(first.status, 'new');
    const skipped = await installGuidelines(project, false);
    assert.equal(skipped.status, 'skipped');
    const updated = await installGuidelines(project, true);
    assert.equal(updated.status, 'updated');
  });

  it('fails fast when a required asset is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(() => install({ target: cursor, root }, true, emptyAssets), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing asset\(s\)/);
      assert.match(err.message, /sw-planner\.md/);
      return true;
    });
  });

  it('fails fast when guidelines artifact is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(() => installGuidelines(root, true, emptyAssets), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing asset\(s\)/);
      assert.match(err.message, /CODING_GUIDELINES\.md/);
      return true;
    });
  });

  it('installs Codex agents as toml and skills under a separate root', async () => {
    const agentRoot = await tempDir();
    const skillRoot = await tempDir();
    const report = await install({ target: codex, root: agentRoot, skillsRoot: skillRoot }, true);

    assert.equal(report.destRoot, agentRoot);
    assert.equal(report.skillsDestRoot, skillRoot);

    const agentFiles = report.files.filter((f) => f.dest.endsWith('.toml'));
    const skillFiles = report.files.filter((f) => f.dest.endsWith('SKILL.md'));
    assert.ok(agentFiles.length > 0);
    assert.ok(skillFiles.length > 0);
    assert.ok(agentFiles.every((f) => f.dest.startsWith(join(agentRoot, codex.agentsDir))));
    assert.ok(skillFiles.every((f) => f.dest.startsWith(join(skillRoot, codex.skillsDir))));

    const sampleAgent = agentFiles[0]!;
    const content = await readFile(sampleAgent.dest, 'utf8');
    assert.match(content, /name =/);
    assert.match(content, /developer_instructions/);
  });

  it('skips and overwrites Codex files independently of root split', async () => {
    const agentRoot = await tempDir();
    const skillRoot = await tempDir();
    const inst = { target: codex, root: agentRoot, skillsRoot: skillRoot };
    await install(inst, true);
    const skipped = await install(inst, false);
    assert.ok(skipped.files.every((f) => f.status === 'skipped'));
    const updated = await install(inst, true);
    assert.ok(updated.files.every((f) => f.status === 'updated'));
  });

  it('copies sw-transcribe-audio companion script as-is', async () => {
    const source = await readFile(join(assetsDir(), 'skills', 'sw-transcribe-audio', 'transcribe.py'), 'utf8');

    const root = await tempDir();
    const report = await install({ target: cursor, root }, true);
    const dest = join(root, cursor.skillsDir, 'sw-transcribe-audio', 'transcribe.py');
    assert.equal(await readFile(dest, 'utf8'), source);
    assert.ok(report.files.some((f) => f.dest === dest));

    const agentRoot = await tempDir();
    const skillRoot = await tempDir();
    const codexReport = await install({ target: codex, root: agentRoot, skillsRoot: skillRoot }, true);
    const codexDest = join(skillRoot, codex.skillsDir, 'sw-transcribe-audio', 'transcribe.py');
    assert.equal(await readFile(codexDest, 'utf8'), source);
    assert.ok(codexReport.files.some((f) => f.dest === codexDest));
  });

  it('anyPresent is true if either Codex tree has files', async () => {
    const agentRoot = await tempDir();
    const skillRoot = await tempDir();
    assert.equal(await anyPresent(agentRoot, codex, skillRoot), false);

    await install({ target: codex, root: agentRoot, skillsRoot: await tempDir() }, true);
    assert.equal(await anyPresent(agentRoot, codex, skillRoot), true);

    const emptyAgents = await tempDir();
    await install({ target: codex, root: await tempDir(), skillsRoot: skillRoot }, true);
    assert.equal(await anyPresent(emptyAgents, codex, skillRoot), true);
  });
});
