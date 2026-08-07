import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agents, skills } from '../domain/pipeline.ts';
import type { InstallTarget, Target } from '../domain/targets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const defaultAssetsDir = join(here, '..', 'assets');
export const guidelinesFileName = 'CODING_GUIDELINES.md';
const agentSource = (assetsRoot: string, name: string) => join(assetsRoot, 'agents', `${name}.md`);
const skillSource = (assetsRoot: string, name: string) => join(assetsRoot, 'skills', name, 'SKILL.md');
const artifactSource = (assetsRoot: string, name: string) => join(assetsRoot, 'artifacts', name);

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

function isAbsent(err: unknown): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

const exists = async (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    (err) => {
      if (isAbsent(err)) return false;
      throw err;
    },
  );

/** Fail fast if any required asset path is missing. */
async function assertSourcesExist(paths: readonly string[]): Promise<void> {
  const missing: string[] = [];
  for (const p of paths) {
    if (!(await exists(p))) missing.push(p);
  }
  if (missing.length === 0) return;
  throw new Error(`missing asset(s):\n${missing.map((p) => `  ${p}`).join('\n')}`);
}

/** Write one asset file to its target location, honoring overwrite and the target rewrite. */
async function put(dest: string, source: string, rewrite: (s: string) => string, overwrite: boolean): Promise<FileStatus> {
  const present = await exists(dest);
  if (present && !overwrite) return 'skipped';
  await mkdir(dirname(dest), { recursive: true });
  const content = await readFile(source, 'utf8');
  await writeFile(dest, rewrite(content), 'utf8');
  return present ? 'updated' : 'new';
}

/** Copy every sw-* agent and each skill into the target's scope root. */
export async function install(
  inst: InstallTarget,
  overwrite: boolean,
  assetsRoot: string = defaultAssetsDir,
): Promise<InstallReport> {
  const { target, root } = inst;
  const sources = [...agents.map((n) => agentSource(assetsRoot, n)), ...skills.map((n) => skillSource(assetsRoot, n))];
  await assertSourcesExist(sources);

  const files: InstalledFile[] = [];

  for (const name of agents) {
    const dest = join(root, target.agentsDir, `${name}.md`);
    files.push({ dest, status: await put(dest, agentSource(assetsRoot, name), target.rewriteAgent, overwrite) });
  }

  for (const name of skills) {
    const dest = join(root, target.skillsDir, name, 'SKILL.md');
    files.push({ dest, status: await put(dest, skillSource(assetsRoot, name), target.rewriteSkill, overwrite) });
  }

  return { target, destRoot: root, files };
}

/** True if any file for this target already exists at root. */
export async function anyPresent(root: string, target: Target): Promise<boolean> {
  for (const name of agents) {
    if (await exists(join(root, target.agentsDir, `${name}.md`))) return true;
  }
  for (const name of skills) {
    if (await exists(join(root, target.skillsDir, name, 'SKILL.md'))) return true;
  }
  return false;
}

/** Project-root path for the shared coding guidelines artifact. */
export function guidelinesDest(projectRoot: string): string {
  return join(projectRoot, guidelinesFileName);
}

/** True if CODING_GUIDELINES.md already exists at the project root. */
export async function guidelinesPresent(projectRoot: string): Promise<boolean> {
  return exists(guidelinesDest(projectRoot));
}

/** Copy CODING_GUIDELINES.md to the project root (identity rewrite). */
export async function installGuidelines(
  projectRoot: string,
  overwrite: boolean,
  assetsRoot: string = defaultAssetsDir,
): Promise<InstalledFile> {
  const source = artifactSource(assetsRoot, guidelinesFileName);
  await assertSourcesExist([source]);
  const dest = guidelinesDest(projectRoot);
  const status = await put(dest, source, (s) => s, overwrite);
  return { dest, status };
}
