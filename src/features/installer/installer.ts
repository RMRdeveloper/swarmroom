import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { assetsDir } from '../../shared/kernel/package-root.ts';
import { agents, skills } from '../../shared/kernel/pipeline.ts';

import type { InstallTarget, Target } from './targets.ts';

const defaultAssetsDir = assetsDir();
export const guidelinesFileName = 'CODING_GUIDELINES.md';
export const ARTIFACTS_ALLOWLIST = ['check-comments.mjs'] as const;
const SKILL_FILE_NAME = 'SKILL.md';
const agentSource = (assetsRoot: string, name: string) =>
  path.join(assetsRoot, 'agents', `${name}.md`);
const skillSource = (assetsRoot: string, name: string) =>
  path.join(assetsRoot, 'skills', name, SKILL_FILE_NAME);
const artifactSource = (assetsRoot: string, name: string) =>
  path.join(assetsRoot, 'artifacts', name);

export const artifactsDir = (projectRoot: string): string =>
  path.join(projectRoot, '.swarmroom', 'artifacts');
export const assetsArtifactSource = (assetsRoot: string, name: string): string =>
  path.join(assetsRoot, 'artifacts', name);
export function artifactsDest(projectRoot: string, fileName?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion -- allowlist is statically non-empty
  const name = fileName ?? ARTIFACTS_ALLOWLIST[0]!;
  return path.join(artifactsDir(projectRoot), name);
}

export type FileStatus = 'new' | 'updated' | 'skipped';
export interface InstalledFile {
  readonly dest: string;
  readonly status: FileStatus;
}
export interface InstallReport {
  readonly target: Target;
  readonly destRoot: string;
  readonly skillsDestRoot?: string;
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
    (error: unknown) => {
      if (isAbsent(error)) return false;
      throw error;
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

async function put(
  dest: string,
  source: string,
  rewrite: (s: string) => string,
  overwrite: boolean,
): Promise<FileStatus> {
  const present = await exists(dest);
  if (present && !overwrite) return 'skipped';
  await mkdir(path.dirname(dest), { recursive: true });
  const content = await readFile(source, 'utf8');
  await writeFile(dest, rewrite(content), 'utf8');
  return present ? 'updated' : 'new';
}

export async function install(
  inst: InstallTarget,
  overwrite: boolean,
  assetsRoot: string = defaultAssetsDir,
): Promise<InstallReport> {
  const { target, root } = inst;
  const skillsRoot = inst.skillsRoot ?? root;
  const sources = [
    ...agents.map((n) => agentSource(assetsRoot, n)),
    ...skills.map((n) => skillSource(assetsRoot, n)),
  ];
  await assertSourcesExist(sources);

  const files: InstalledFile[] = [];

  for (const name of agents) {
    const dest = path.join(root, target.agentsDir, `${name}.${target.agentExt}`);
    files.push({
      dest,
      status: await put(dest, agentSource(assetsRoot, name), target.rewriteAgent, overwrite),
    });
  }

  for (const name of skills) {
    const destDir = path.join(skillsRoot, target.skillsDir, name);
    const dest = path.join(destDir, SKILL_FILE_NAME);
    files.push({
      dest,
      status: await put(dest, skillSource(assetsRoot, name), target.rewriteSkill, overwrite),
    });

    const sourceDir = path.join(assetsRoot, 'skills', name);
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name === SKILL_FILE_NAME) continue;
      const companionDest = path.join(destDir, entry.name);
      files.push({
        dest: companionDest,
        status: await put(companionDest, path.join(sourceDir, entry.name), (s) => s, overwrite),
      });
    }
  }

  if (inst.skillsRoot === undefined || inst.skillsRoot === root) {
    return { target, destRoot: root, files };
  }
  return { target, destRoot: root, skillsDestRoot: inst.skillsRoot, files };
}

export async function anyPresent(
  root: string,
  target: Target,
  skillsRoot: string = root,
): Promise<boolean> {
  for (const name of agents) {
    if (await exists(path.join(root, target.agentsDir, `${name}.${target.agentExt}`))) return true;
  }
  for (const name of skills) {
    if (await exists(path.join(skillsRoot, target.skillsDir, name, SKILL_FILE_NAME))) return true;
  }
  return false;
}

export function guidelinesDest(projectRoot: string): string {
  return path.join(projectRoot, guidelinesFileName);
}

export async function guidelinesPresent(projectRoot: string): Promise<boolean> {
  return exists(guidelinesDest(projectRoot));
}

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

export async function artifactsPresent(projectRoot: string): Promise<boolean> {
  for (const name of ARTIFACTS_ALLOWLIST) {
    if (await exists(artifactsDest(projectRoot, name))) return true;
  }
  return false;
}

export async function installArtifacts(
  projectRoot: string,
  overwrite: boolean,
  assetsRoot: string = defaultAssetsDir,
): Promise<readonly InstalledFile[]> {
  const sources = ARTIFACTS_ALLOWLIST.map((name) => assetsArtifactSource(assetsRoot, name));
  await assertSourcesExist(sources);
  const files: InstalledFile[] = [];
  for (const name of ARTIFACTS_ALLOWLIST) {
    const dest = artifactsDest(projectRoot, name);
    const source = assetsArtifactSource(assetsRoot, name);
    const status = await put(dest, source, (s) => s, overwrite);
    files.push({ dest, status });
  }
  return files;
}
