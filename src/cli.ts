#!/usr/bin/env node
import { homedir } from 'node:os';

import { packageVersion, parseArgs, formatHelp } from './cli/args.ts';
import {
  anyPresent,
  artifactsPresent,
  guidelinesFileName,
  guidelinesPresent,
  install,
  installArtifacts,
  installGuidelines,
} from './features/installer/installer.ts';
import { confirm, close, selectMultiple } from './features/installer/prompts.ts';
import {
  printArtifactReport,
  printClosing,
  printOpening,
  printTargetReport,
} from './features/installer/report.ts';
import { scopeRoot, scopeSkillsRoot } from './features/installer/targets.ts';
import { runTasks } from './features/tasks-cli/tasks.ts';
import * as style from './shared/kernel/style.ts';

const TTY = process.stdout.isTTY;
const CHECK_COMMENTS_ARTIFACT = '.swarmroom/artifacts/check-comments.mjs';

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
    if (parsed.kind === 'validate-findings') {
      const { readFileSync } = await import('node:fs');
      const { validateFindings } = await import('./shared/kernel/findings-validator.ts');
      let raw: string;
      try {
        raw = readFileSync(parsed.file, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(`cannot read ${parsed.file}: ${message}`);
        process.exitCode = 1;
        return;
      }
      const result = validateFindings(raw, { strict: parsed.strict });
      if (result.valid) {
        if (result.findings.length === 0) console.log('No findings');
        else console.log(`Valid findings: ${String(result.findings.length)}`);
        return;
      }
      for (const err of result.errors) console.error(style.error(err));
      process.exitCode = 1;
      return;
    }

    let chosen = parsed.options.chosen;
    let scope = parsed.options.scope;
    const dir = parsed.options.dir;
    const force = parsed.options.force;
    const verbose = parsed.options.verbose;
    const quiet = parsed.options.quiet;
    const version = packageVersion();
    const reportOpts = { verbose, quiet };

    if (TTY && !parsed.options.explicit) {
      chosen = await selectMultiple('Pick the editors to install into:', chosen);
      scope = (await confirm('Install into the global home directory?', false))
        ? 'global'
        : 'project';
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

      const artifactsOverwrite =
        force ||
        (TTY &&
          (await artifactsPresent(dir)) &&
          (await confirm(
            `Existing ${CHECK_COMMENTS_ARTIFACT} in ${pathHint(dir)} will be replaced. Continue?`,
            true,
          )));
      const artifactFiles = await installArtifacts(dir, artifactsOverwrite);
      for (const artifactFile of artifactFiles) {
        printArtifactReport(
          CHECK_COMMENTS_ARTIFACT,
          artifactFile.dest,
          artifactFile.status,
          reportOpts,
        );
      }
    }

    printClosing(chosen);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(message);
    process.exitCode = 1;
  } finally {
    close();
  }
}

await main();
