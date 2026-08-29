import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** Scope of installation: project-local or global home. */
export type Scope = 'project' | 'global';

/** Identifier of an install target editor. */
export type TargetId = 'cursor' | 'opencode' | 'claude' | 'codex';

/** Extension used for installed agent files. */
export type AgentExt = 'md' | 'toml';

/** Install target metadata. */
export interface Target {
  readonly id: TargetId;
  readonly label: string;
  /** Dot-dir dropped at project root, e.g. `.cursor`. */
  readonly root: string;
  /** Folder holding agents inside the root, e.g. `agents` or `agent`. */
  readonly agentsDir: string;
  /** File extension for installed agents. */
  readonly agentExt: AgentExt;
  /** Folder holding `<skill>/SKILL.md` inside the root. */
  readonly skillsDir: string;
  /** Absolute base dir for the global scope (home-relative). */
  readonly globalBase: string;
  /** Project-relative skills root when it differs from `root`. */
  readonly skillsRoot?: string;
  /** Absolute skills base for the global scope when it differs from `globalBase`. */
  readonly skillsGlobalBase?: string;
  /** Patch an agent's frontmatter/body so it is valid for this tool. */
  readonly rewriteAgent: (source: string) => string;
  /** Patch a skill's frontmatter/body so it is valid for this tool. */
  readonly rewriteSkill: (source: string) => string;
}

/** Install target with resolved roots. */
export interface InstallTarget {
  readonly target: Target;
  readonly root: string;
  readonly skillsRoot?: string;
}

const TOML_LITERAL_DELIM = "'''";

/** Remove frontend-only hints from source. */
function dropToBase(source: string): string {
  const kept = source
    .split('\n')
    .filter(
      (line) => !/^(readonly:|model:|argument-hint:|disable-model-invocation:)/.test(line.trim()),
    );
  return kept
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trimStart();
}

/** Mark opencode/claude agents as subagents. */
function subagent(source: string): string {
  const lines = dropToBase(source).split('\n');
  const at = lines.findIndex((line) => line.trim().startsWith('description:'));
  lines.splice(at + 1, 0, 'mode: subagent');
  return lines.join('\n');
}

/** Extract YAML scalar for a key from frontmatter. */
function yamlScalar(frontmatter: string, key: string): string | undefined {
  const prefix = `${key}:`;
  const line = frontmatter.split('\n').find((entry) => entry.trim().startsWith(prefix));
  if (!line) return undefined;
  const value = line.trim().slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
}

/** Require YAML scalar value. */
function requiredYamlScalar(frontmatter: string, key: string): string {
  const value = yamlScalar(frontmatter, key);
  if (!value) throw new Error(`agent source is missing frontmatter ${key}`);
  return value;
}

/** Split agent source into frontmatter and body. */
function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('agent source is missing opening YAML frontmatter delimiter');
  }
  const closeAt = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closeAt === -1) {
    throw new Error('agent source is missing closing YAML frontmatter delimiter');
  }
  return {
    frontmatter: lines.slice(1, closeAt).join('\n'),
    body: lines.slice(closeAt + 1).join('\n'),
  };
}

/** Encode value as TOML basic string. */
function tomlBasicString(value: string): string {
  let encoded = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) throw new Error('unreachable: empty string codePoint');

    switch (char) {
      case '"': {
        encoded += String.raw`\"`;
        break;
      }
      case '\\': {
        encoded += '\\\\';
        break;
      }
      case '\b': {
        encoded += String.raw`\b`;
        break;
      }
      case '\t': {
        encoded += String.raw`\t`;
        break;
      }
      case '\n': {
        encoded += String.raw`\n`;
        break;
      }
      case '\f': {
        encoded += String.raw`\f`;
        break;
      }
      case '\r': {
        encoded += String.raw`\r`;
        break;
      }
      default: {
        encoded += code < 0x20 ? String.raw`\u${code.toString(16).padStart(4, '0')}` : char;
      }
    }
  }
  return `"${encoded}"`;
}

/** Encode value as TOML literal string. */
function tomlLiteralString(value: string): string {
  if (value.includes(TOML_LITERAL_DELIM)) {
    throw new Error(
      `cannot encode developer_instructions as a TOML literal: body contains ${TOML_LITERAL_DELIM}`,
    );
  }
  return `${TOML_LITERAL_DELIM}${value}${TOML_LITERAL_DELIM}`;
}

/** Rewrite generic agent for Codex TOML format. */
function rewriteCodexAgent(source: string): string {
  const { frontmatter, body } = splitFrontmatter(source);
  const name = requiredYamlScalar(frontmatter, 'name');
  const description = requiredYamlScalar(frontmatter, 'description');
  const instructions = dropToBase(body).trim();
  return [
    `name = ${tomlBasicString(name)}`,
    `description = ${tomlBasicString(description)}`,
    `developer_instructions = ${tomlLiteralString(instructions)}`,
  ].join('\n');
}

/** Supported install targets. */
export const targets: readonly Target[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    root: '.cursor',
    agentsDir: 'agents',
    agentExt: 'md',
    skillsDir: 'skills',
    globalBase: path.join(homedir(), '.cursor'),
    rewriteAgent: (source) => source,
    rewriteSkill: (source) => source,
  },
  {
    id: 'opencode',
    label: 'opencode',
    root: '.opencode',
    agentsDir: 'agent',
    agentExt: 'md',
    skillsDir: 'skills',
    globalBase: path.join(homedir(), '.config', 'opencode'),
    rewriteAgent: subagent,
    rewriteSkill: dropToBase,
  },
  {
    id: 'claude',
    label: 'Claude Code',
    root: '.claude',
    agentsDir: 'agents',
    agentExt: 'md',
    skillsDir: 'skills',
    globalBase: path.join(homedir(), '.claude'),
    rewriteAgent: subagent,
    rewriteSkill: dropToBase,
  },
  {
    id: 'codex',
    label: 'Codex',
    root: '.codex',
    agentsDir: 'agents',
    agentExt: 'toml',
    globalBase: path.join(homedir(), '.codex'),
    skillsRoot: '.agents',
    skillsDir: 'skills',
    skillsGlobalBase: path.join(homedir(), '.agents'),
    rewriteAgent: rewriteCodexAgent,
    rewriteSkill: dropToBase,
  },
];

/** Resolve project or global root for a target. */
export function scopeRoot(target: Target, scope: Scope, cwd: string): string {
  return scope === 'global' ? target.globalBase : path.join(cwd, target.root);
}

/** Resolve skills root for a target. */
export function scopeSkillsRoot(target: Target, scope: Scope, cwd: string): string {
  if (scope === 'global') return target.skillsGlobalBase ?? target.globalBase;
  return path.join(cwd, target.skillsRoot ?? target.root);
}

/** Resolve homedir to realpath; fallback to resolved path when missing. */
function realpathSafe(p: string): string {
  try {
    if (existsSync(p)) return realpathSync(p);
    return path.resolve(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Ensure a global install root lives under the real homedir.
 * Invariant: global roots must be inside homedir() realpath; symlinks outside are rejected unless force.
 */
export function assertHomedirSafe(root: string, force: boolean): void {
  const homeReal = realpathSafe(homedir());
  const rootReal = realpathSafe(root);
  const underHome = rootReal === homeReal || rootReal.startsWith(`${homeReal}${path.sep}`);
  if (underHome) return;
  if (force) return;
  throw new Error(
    `refusing to write outside homedir: ${root} (resolved ${rootReal}) not under ${homeReal} (use --force to override)`,
  );
}

/** Validate all global roots for a target when scope is global. */
export function assertInstallTargetSafe(inst: InstallTarget, scope: Scope, force: boolean): void {
  if (scope !== 'global') return;
  assertHomedirSafe(inst.root, force);
  if (inst.skillsRoot !== undefined && inst.skillsRoot !== inst.root) {
    assertHomedirSafe(inst.skillsRoot, force);
  }
}
