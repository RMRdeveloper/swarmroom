import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agents, skillName } from '../domain/pipeline.ts';
import type { InstallTarget, Target } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const assetsDir = join(here, '..', 'assets');
const agentSource = (name: string) => join(assetsDir, 'agents', `${name}.md`);
const skillSource = () => join(assetsDir, 'skills', skillName, 'SKILL.md');

export type FileStatus = 'new' | 'updated' | 'skipped';
export interface InstalledFile {
  readonly dest: string;
  readonly status: FileStatus;
}
export interface InstallReport {
  readonly target: Target;
  readonly destRoot: string;
  readonly files: readonly InstalledFile[];
}

const exists = async (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Write one asset file to its target location, honoring overwrite and the target rewrite. */
async function put(dest: string, source: string, rewrite: (s: string) => string, overwrite: boolean): Promise<FileStatus> {
  const present = await exists(dest);
  if (present && !overwrite) return 'skipped';
  await mkdir(dirname(dest), { recursive: true });
  const content = await readFile(source, 'utf8');
  await writeFile(dest, rewrite(content), 'utf8');
  return present ? 'updated' : 'new';
}

/** Copy every sw-* agent and the skill into the target's scope root. */
export async function install(inst: InstallTarget, overwrite: boolean): Promise<InstallReport> {
  const { target, root } = inst;
  const files: InstalledFile[] = [];

  for (const name of agents) {
    const dest = join(root, target.agentsDir, `${name}.md`);
    files.push({ dest, status: await put(dest, agentSource(name), target.rewriteAgent, overwrite) });
  }

  const skillDest = join(root, target.skillsDir, skillName, 'SKILL.md');
  files.push({ dest: skillDest, status: await put(skillDest, skillSource(), target.rewriteSkill, overwrite) });

  return { target, destRoot: root, files };
}

/** True if any file for this target already exists at root. */
export async function anyPresent(root: string, target: Target): Promise<boolean> {
  for (const name of agents) {
    if (await exists(join(root, target.agentsDir, `${name}.md`))) return true;
  }
  return exists(join(root, target.skillsDir, skillName, 'SKILL.md'));
}