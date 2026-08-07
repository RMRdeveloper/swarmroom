#!/usr/bin/env node
import { confirm, close, selectMultiple } from './cli/prompts.ts';
import type { Scope, Target } from './domain/targets.ts';
import { targets } from './domain/targets.ts';
import { anyPresent, install } from './io/installer.ts';
import { cwd } from 'node:process';
import { join } from 'node:path';

const TTY = process.stdout.isTTY;

const HELP = `swarmroom — install the sw-* pipeline agents into your editor.

Usage:
  node src/cli.ts [options]

Options:
  --cursor | --opencode | --claude   install for those editors (default: all)
  --global                            install into the homedir (default: this project)
  --dir <path>                        install into another project root
  --force                             overwrite existing files without asking
  --help                              show this help

Run with no editor flag in a terminal to choose interactively.
Re-run to update the installed files.`;

interface Options {
  chosen: readonly Target[];
  scope: Scope;
  dir: string;
  force: boolean;
  explicit: boolean;
}

function parseArgs(argv: readonly string[]): Options | null {
  const picked: Target[] = [];
  let scope: Scope = 'project';
  let dir = cwd();
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const match = targets.find((t) => a === `--${t.id}`);
    if (match) {
      picked.push(match);
    } else if (a === '--global') {
      scope = 'global';
    } else if (a === '--dir') {
      dir = argv[++i] ?? '';
    } else if (a === '--force') {
      force = true;
    } else if (a === '--help' || a === '-h') {
      console.log(HELP);
      return null;
    } else {
      console.error(`unknown option: ${a}\nRun with --help for usage.`);
      return null;
    }
  }

  return { chosen: picked.length ? picked : targets, scope, dir, force, explicit: picked.length > 0 };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;

  let { chosen, scope, dir, force } = args;

  if (TTY && !args.explicit) {
    chosen = await selectMultiple('Pick the editors to install into:', chosen);
    if (await confirm('Use the global homedir instead of this project?', false)) scope = 'global';
  }

  for (const target of chosen) {
    const root = scope === 'global' ? target.globalBase : join(dir, target.root);
    const overwrite = force || (TTY && (await anyPresent(root, target)) && (await confirm(`Overwrite existing in ${target.label}?`, true)));
    const report = await install({ target, scope, root }, overwrite);

    const counts = report.files.reduce<Record<string, number>>((acc, f) => ((acc[f.status] = (acc[f.status] ?? 0) + 1), acc), {});
    console.log(`\n${target.label} -> ${report.destRoot}`);
    for (const [status, n] of Object.entries(counts)) console.log(`  ${n} ${status}`);
  }

  close();
  console.log(`\nDone. Restart ${chosen.map((t) => t.label).join(', ')} to load the agents.`);
}

await main();