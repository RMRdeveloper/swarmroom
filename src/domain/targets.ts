import { homedir } from 'node:os';
import { join } from 'node:path';

export type Scope = 'project' | 'global';
export type TargetId = 'cursor' | 'opencode' | 'claude';

export interface Target {
  readonly id: TargetId;
  readonly label: string;
  /** Dot-dir dropped at project root, e.g. `.cursor`. */
  readonly root: string;
  /** Folder holding `<agent>.md` inside the root, e.g. `agents` or `agent`. */
  readonly agentsDir: string;
  /** Folder holding `<skill>/SKILL.md` inside the root, e.g. `skills` or `skill`. */
  readonly skillsDir: string;
  /** Absolute base dir for the global scope (home-relative). */
  readonly globalBase: string;
  /** Patch an agent's frontmatter/body so it is valid for this tool. */
  readonly rewriteAgent: (source: string) => string;
  /** Patch a skill's frontmatter/body so it is valid for this tool. */
  readonly rewriteSkill: (source: string) => string;
}

/** Strip tool-specific lines Cursor alone supports. */
function dropToBase(source: string): string {
  const kept = source
    .split('\n')
    .filter((l) => !/^(readonly:|model:|argument-hint:|disable-model-invocation:)/.test(l.trim()));
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

/** opencode/Claude drive agents off `mode: subagent`, not `readonly`. */
function subagent(source: string): string {
  const lines = dropToBase(source).split('\n');
  const at = lines.findIndex((l) => l.trim().startsWith('description:'));
  lines.splice(at + 1, 0, 'mode: subagent');
  return lines.join('\n');
}

export const targets: readonly Target[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    root: '.cursor',
    agentsDir: 'agents',
    skillsDir: 'skills',
    globalBase: join(homedir(), '.cursor'),
    rewriteAgent: (s) => s,
    rewriteSkill: (s) => s,
  },
  {
    id: 'opencode',
    label: 'opencode',
    root: '.opencode',
    agentsDir: 'agent',
    skillsDir: 'skill',
    globalBase: join(homedir(), '.config', 'opencode'),
    rewriteAgent: subagent,
    rewriteSkill: dropToBase,
  },
  {
    id: 'claude',
    label: 'Claude Code',
    root: '.claude',
    agentsDir: 'agents',
    skillsDir: 'skills',
    globalBase: join(homedir(), '.claude'),
    rewriteAgent: subagent,
    rewriteSkill: dropToBase,
  },
];

/** Absolute destination root for a target at a given scope. */
export function scopeRoot(target: Target, scope: Scope, cwd: string): string {
  return scope === 'global' ? target.globalBase : join(cwd, target.root);
}

/** What `install` needs to place files for one target. */
export interface InstallTarget {
  readonly target: Target;
  readonly root: string;
}
