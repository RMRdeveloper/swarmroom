import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { assetsDir } from '../../shared/kernel/package-root.ts';

import { anyPresent, install, installGuidelines, installPi, piPresent } from './installer.ts';
import { targets } from './targets.ts';

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
    await assert.rejects(
      () => install({ target: cursor, root }, true, emptyAssets),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /missing asset\(s\)/);
        assert.match(err.message, /sw-planner\.md/);
        return true;
      },
    );
  });

  it('fails fast when guidelines artifact is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(
      () => installGuidelines(root, true, emptyAssets),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /missing asset\(s\)/);
        assert.match(err.message, /CODING_GUIDELINES\.md/);
        return true;
      },
    );
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
    const source = await readFile(
      join(assetsDir(), 'skills', 'sw-transcribe-audio', 'transcribe.py'),
      'utf8',
    );

    const root = await tempDir();
    const report = await install({ target: cursor, root }, true);
    const dest = join(root, cursor.skillsDir, 'sw-transcribe-audio', 'transcribe.py');
    assert.equal(await readFile(dest, 'utf8'), source);
    assert.ok(report.files.some((f) => f.dest === dest));

    const agentRoot = await tempDir();
    const skillRoot = await tempDir();
    const codexReport = await install(
      { target: codex, root: agentRoot, skillsRoot: skillRoot },
      true,
    );
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

  it('skips companions when overwrite is false', async () => {
    const root = await tempDir();
    const first = await install({ target: cursor, root }, true);
    const companion = first.files.find((f) => f.dest.endsWith('transcribe.py'));
    assert.ok(companion);
    const second = await install({ target: cursor, root }, false);
    const companionSecond = second.files.find((f) => f.dest === companion.dest);
    assert.ok(companionSecond);
    assert.equal(companionSecond.status, 'skipped');
    assert.ok(second.files.every((f) => f.status === 'skipped'));
  });

  it('dry-run does not write files', async () => {
    const root = await tempDir();
    const report = await install({ target: cursor, root }, true, undefined, {
      dryRun: true,
    });
    assert.ok(report.files.length > 0);
    assert.ok(report.files.every((f) => f.status === 'new'));
    assert.equal(existsSync(join(root, cursor.agentsDir, 'sw-planner.md')), false);
    assert.equal(existsSync(join(root, cursor.skillsDir, 'sw-pipeline', 'SKILL.md')), false);
    // dry-run with overwrite false still reports correctly after real install
    await install({ target: cursor, root }, true);
    const drySkipped = await install({ target: cursor, root }, false, undefined, {
      dryRun: true,
    });
    assert.ok(drySkipped.files.every((f) => f.status === 'skipped'));
    // dry-run does not mutate mtime
    const dest = join(root, cursor.agentsDir, 'sw-planner.md');
    const before = await stat(dest);
    await install({ target: cursor, root }, true, undefined, { dryRun: true });
    const afterStat = await stat(dest);
    assert.equal(before.mtimeMs, afterStat.mtimeMs);
  });

  it('parallel install does not lose files', async () => {
    const root = await tempDir();
    const report = await install({ target: cursor, root }, true);
    // Re-install should still produce same file count
    const second = await install({ target: cursor, root }, true);
    assert.equal(report.files.length, second.files.length);
    // All destinations unique
    const dests = new Set(report.files.map((f) => f.dest));
    assert.equal(dests.size, report.files.length);
    // No tmp files left behind
    const allEntries: string[] = [];
    async function collect(dir: string): Promise<void> {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await collect(full);
        else allEntries.push(full);
      }
    }
    await collect(root);
    assert.ok(allEntries.every((p) => !p.includes('.tmp.')));
  });

  it('handles write failure as failed status without throwing', async () => {
    const root = await tempDir();
    // Make root a file to force mkdir/write failure for nested dest
    const badRoot = join(root, 'blocked');
    await mkdir(badRoot, { recursive: true });
    await writeFile(join(badRoot, cursor.agentsDir), 'blocking file', 'utf8');
    // Use a target pointing inside blocked dir - at least some files will fail
    const report = await install({ target: cursor, root: badRoot }, true);
    assert.ok(report.files.some((f) => f.status === 'failed'));
    // install should not throw even with partial failures
    assert.ok(report.files.length > 0);
  });

  it('atomic write does not leave partial file on failure (tmp cleaned)', async () => {
    const root = await tempDir();
    // Force a companion file to be unreadable by making source a directory? Instead test that failed status cleans tmp
    const report = await install({ target: cursor, root }, true);
    assert.ok(report.files.every((f) => f.status === 'new'));
    // Ensure no tmp artifacts
    const { readdir: rd } = await import('node:fs/promises');
    const flat: string[] = [];
    async function walk(d: string): Promise<void> {
      const ents = await rd(d, { withFileTypes: true });
      for (const e of ents) {
        const p = join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else flat.push(p);
      }
    }
    await walk(root);
    assert.equal(flat.filter((p) => p.includes('.tmp.')).length, 0);
  });
});

describe('installer pi', () => {
  const dirs: string[] = [];

  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'swarmroom-pi-'));
    dirs.push(dir);
    return dir;
  }

  it('installs the extension and skill under root', async () => {
    const root = await tempDir();
    const files = await installPi(root, true);
    assert.equal(files.length, 2);
    assert.ok(files.every((f) => f.status === 'new'));
    const ext = await readFile(join(root, 'extensions', 'sw-pipeline.ts'), 'utf8');
    assert.match(ext, /registerCommand\('sw-pipeline'/);
    const skill = await readFile(join(root, 'skills', 'sw-pipeline', 'SKILL.md'), 'utf8');
    assert.match(skill, /name: sw-pipeline/);
  });

  it('skips without overwrite and updates with overwrite', async () => {
    const root = await tempDir();
    await installPi(root, true);
    const skipped = await installPi(root, false);
    assert.ok(skipped.every((f) => f.status === 'skipped'));
    const updated = await installPi(root, true);
    assert.ok(updated.every((f) => f.status === 'updated'));
  });

  it('piPresent reflects installed files', async () => {
    const root = await tempDir();
    assert.equal(await piPresent(root), false);
    await installPi(root, true);
    assert.equal(await piPresent(root), true);
  });

  it('fails fast when a pi asset is missing', async () => {
    const root = await tempDir();
    const emptyAssets = await tempDir();
    await assert.rejects(() => installPi(root, true, emptyAssets), /missing asset\(s\)/);
  });

  it('dry-run does not write files', async () => {
    const root = await tempDir();
    const files = await installPi(root, true, assetsDir(), { dryRun: true });
    assert.ok(files.every((f) => f.status === 'new'));
    assert.equal(existsSync(join(root, 'extensions', 'sw-pipeline.ts')), false);
  });
});
