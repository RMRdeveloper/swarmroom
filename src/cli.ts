#!/usr/bin/env node
import { packageVersion, parseArgs, formatHelp } from './cli/args.ts';
import { confirm, close, selectMultiple } from './cli/prompts.ts';
import { printArtifactReport, printClosing, printOpening, printTargetReport } from './cli/report.ts';
import * as style from './cli/style.ts';
import { runTasks } from './cli/tasks.ts';
import { scopeRoot, scopeSkillsRoot } from './domain/targets.ts';
import {
  anyPresent,
  guidelinesFileName,
  guidelinesPresent,
  install,
  installGuidelines,
} from './io/installer.ts';
import { homedir } from 'node:os';

const TTY = process.stdout.isTTY;

/** Display path for confirms; shortens `$HOME` to `~`. */
function pathHint(root: string): string {
  const home = homedir();
  return root.startsWith(home) ? `~${root.slice(home.length)}` : root;
}

function printError(message: string): void {
  console.error(style.error(`error: ${message}`));
}

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.kind === 'help') {
      console.log(formatHelp());
      return;
    }
    if (parsed.kind === 'version') {
      console.log(packageVersion());
      return;
    }
    if (parsed.kind === 'error') {
      printError(parsed.message);
      process.exitCode = 1;
      return;
    }
    if (parsed.kind === 'tasks') {
      await runTasks({ dir: parsed.dir, tasksFile: parsed.tasksFile, command: parsed.command });
      return;
    }

    let { chosen, scope, dir, force, verbose, quiet } = parsed.options;
    const version = packageVersion();
    const reportOpts = { verbose, quiet };

    if (TTY && !parsed.options.explicit) {
      chosen = await selectMultiple('Pick the editors to install into:', chosen);
      scope = (await confirm('Install into the global home directory?', false)) ? 'global' : 'project';
    }

    printOpening(version, scope, dir);

    for (const target of chosen) {
      const root = scopeRoot(target, scope, dir);
      const skillsDest = scopeSkillsRoot(target, scope, dir);
      const confirmMessage =
        skillsDest === root
          ? `Existing ${target.label} files in ${pathHint(root)} will be replaced. Continue?`
          : `Existing ${target.label} files in ${pathHint(root)} and ${pathHint(skillsDest)} will be replaced. Continue?`;
      const overwrite =
        force ||
        (TTY &&
          (await anyPresent(root, target, skillsDest)) &&
          (await confirm(confirmMessage, true)));
      const report = await install(
        skillsDest === root ? { target, root } : { target, root, skillsRoot: skillsDest },
        overwrite,
      );
      printTargetReport(report, reportOpts);
    }

    if (scope === 'project') {
      const overwrite =
        force ||
        (TTY &&
          (await guidelinesPresent(dir)) &&
          (await confirm(
            `Existing ${guidelinesFileName} in ${pathHint(dir)} will be replaced. Continue?`,
            true,
          )));
      const file = await installGuidelines(dir, overwrite);
      printArtifactReport(guidelinesFileName, file.dest, file.status, reportOpts);
    }

    printClosing(chosen);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printError(message);
    process.exitCode = 1;
  } finally {
    close();
  }
}

await main();
