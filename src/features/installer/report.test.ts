import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { InstallReport } from './installer.ts';
import {
  displayPath,
  formatArtifactBody,
  formatStatusCounts,
  formatTargetBody,
  printArtifactReport,
  printTargetReport,
} from './report.ts';
import type { Target } from './targets.ts';

const fakeTarget = {
  id: 'cursor',
  label: 'Cursor',
  root: '.cursor',
  agentsDir: 'agents',
  agentExt: 'md',
  skillsDir: 'skills',
  globalBase: '/tmp',
  rewriteAgent: (s: string) => s,
  rewriteSkill: (s: string) => s,
} as const satisfies Target;

const fakeCodexTarget = {
  id: 'codex',
  label: 'Codex',
  root: '.codex',
  agentsDir: 'agents',
  agentExt: 'toml',
  skillsDir: 'skills',
  skillsRoot: '.agents',
  globalBase: '/tmp',
  rewriteAgent: (s: string) => s,
  rewriteSkill: (s: string) => s,
} as const satisfies Target;

describe('report formatters', () => {
  it('hides zero status counts', () => {
    const lines = formatStatusCounts({ new: 2, updated: 0, skipped: 1 });
    assert.deepEqual(
      lines.map((l) => l.replaceAll(/\u001B\[[0-9;]*m/g, '')),
      ['  2 new', '  1 skipped'],
    );
  });

  it('formatTargetBody lists files when verbose', () => {
    const destRoot = '/proj/.cursor';
    const report: InstallReport = {
      target: fakeTarget,
      destRoot,
      files: [
        { dest: join(destRoot, 'agents', 'sw-planner.md'), status: 'new' },
        { dest: join(destRoot, 'agents', 'sw-fixer.md'), status: 'skipped' },
      ],
    };
    const body = formatTargetBody(report, true).map((l) => l.replaceAll(/\u001B\[[0-9;]*m/g, ''));
    assert.ok(body.some((l) => l.includes('2 new') || l.includes('1 new')));
    assert.ok(body.some((l) => /new\s+agents\/sw-planner\.md/.test(l)));
    assert.ok(body.some((l) => /skipped\s+agents\/sw-fixer\.md/.test(l)));
  });

  it('formatArtifactBody uses dest when verbose', () => {
    const dest = '/proj/CODING_GUIDELINES.md';
    const body = formatArtifactBody(dest, 'updated', true).map((l) =>
      l.replaceAll(/\u001B\[[0-9;]*m/g, ''),
    );
    assert.ok(body.some((l) => l.includes('1 updated')));
    assert.ok(body.some((l) => l.includes(dest)));
  });

  it('displayPath prefers relative under destRoot', () => {
    assert.equal(displayPath('/a/b/c.md', '/a/b'), 'c.md');
    assert.equal(displayPath('/other/c.md', '/a/b'), '/other/c.md');
  });

  it('formatTargetBody lists split-root files relative to each dest', () => {
    const destRoot = '/proj/.codex';
    const skillsDestRoot = '/proj/.agents';
    const report: InstallReport = {
      target: fakeCodexTarget,
      destRoot,
      skillsDestRoot,
      files: [
        { dest: join(destRoot, 'agents', 'sw-planner.toml'), status: 'new' },
        { dest: join(skillsDestRoot, 'skills', 'sw-pipeline', 'SKILL.md'), status: 'new' },
      ],
    };
    const body = formatTargetBody(report, true).map((l) => l.replaceAll(/\u001B\[[0-9;]*m/g, ''));
    assert.ok(body.some((l) => /new\s+agents\/sw-planner\.toml/.test(l)));
    assert.ok(body.some((l) => /new\s+skills\/sw-pipeline\/SKILL\.md/.test(l)));
    assert.ok(!body.some((l) => l.includes('../.agents')));
  });

  it('printTargetReport header is single-root or split-root', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printTargetReport(
        {
          target: fakeTarget,
          destRoot: '/proj/.cursor',
          files: [{ dest: '/proj/.cursor/agents/x.md', status: 'new' }],
        },
        { verbose: false, quiet: false },
      );
      printTargetReport(
        {
          target: fakeCodexTarget,
          destRoot: '/proj/.codex',
          skillsDestRoot: '/proj/.agents',
          files: [{ dest: '/proj/.codex/agents/sw-planner.toml', status: 'new' }],
        },
        { verbose: false, quiet: false },
      );
      assert.ok(lines.some((l) => l.includes('Cursor → /proj/.cursor')));
      assert.ok(lines.some((l) => l.includes('Codex → /proj/.codex + /proj/.agents')));
    } finally {
      console.log = original;
    }
  });

  it('quiet suppresses target and artifact report bodies', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      const report: InstallReport = {
        target: fakeTarget,
        destRoot: '/proj/.cursor',
        files: [{ dest: '/proj/.cursor/agents/x.md', status: 'new' }],
      };
      printTargetReport(report, { verbose: false, quiet: true });
      printArtifactReport('CODING_GUIDELINES.md', '/proj/CODING_GUIDELINES.md', 'new', {
        verbose: false,
        quiet: true,
      });
      assert.deepEqual(lines, []);
    } finally {
      console.log = original;
    }
  });
});
