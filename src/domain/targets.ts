import { homedir } from 'node:os';
import { join } from 'node:path';

export type Scope = 'project' | 'global';
export type TargetId = 'cursor' | 'opencode' | 'claude' | 'codex';
export type AgentExt = 'md' | 'toml';

export interface Target {
  readonly id: TargetId;
  readonly label: string;
  /** Dot-dir dropped at project root, e.g. `.cursor`. */
  readonly root: string;
  /** Folder holding agents inside the root, e.g. `agents` or `agent`. */
  readonly agentsDir: string;
  /** File extension for installed agents. */
  readonly agentExt: AgentExt;
  /** Folder holding `<skill>/SKILL.md` inside the root, e.g. `skills` or `skill`. */
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

const TOML_LITERAL_DELIM = "'''";

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

function yamlScalar(frontmatter: string, key: string): string | undefined {
  const prefix = `${key}:`;
  const line = frontmatter.split('\n').find((l) => l.trim().startsWith(prefix));
  if (!line) return undefined;
  const value = line.trim().slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
}

function requiredYamlScalar(frontmatter: string, key: string): string {
  const value = yamlScalar(frontmatter, key);
  if (!value) throw new Error(`agent source is missing frontmatter ${key}`);
  return value;
}

/** Split markdown agent source at the closing `---` of YAML frontmatter. */
function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('agent source is missing opening YAML frontmatter delimiter');
  }
  const closeAt = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (closeAt < 0) {
    throw new Error('agent source is missing closing YAML frontmatter delimiter');
  }
  return {
    frontmatter: lines.slice(1, closeAt).join('\n'),
    body: lines.slice(closeAt + 1).join('\n'),
  };
}

function tomlBasicString(value: string): string {
  let encoded = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (ch === '"') encoded += '\\"';
    else if (ch === '\\') encoded += '\\\\';
    else if (ch === '\b') encoded += '\\b';
    else if (ch === '\t') encoded += '\\t';
    else if (ch === '\n') encoded += '\\n';
    else if (ch === '\f') encoded += '\\f';
    else if (ch === '\r') encoded += '\\r';
    else if (code < 0x20) encoded += `\\u${code.toString(16).padStart(4, '0')}`;
    else encoded += ch;
  }
  return `"${encoded}"`;
}

function tomlLiteralString(value: string): string {
  if (value.includes(TOML_LITERAL_DELIM)) {
    throw new Error(
      `cannot encode developer_instructions as a TOML literal: body contains ${TOML_LITERAL_DELIM}`,
    );
  }
  return `${TOML_LITERAL_DELIM}${value}${TOML_LITERAL_DELIM}`;
}

/** Codex agents are TOML with name, description, and developer_instructions only. */
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

export const targets: readonly Target[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    root: '.cursor',
    agentsDir: 'agents',
    agentExt: 'md',
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
    agentExt: 'md',
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
    agentExt: 'md',
    skillsDir: 'skills',
    globalBase: join(homedir(), '.claude'),
    rewriteAgent: subagent,
    rewriteSkill: dropToBase,
  },
  {
    id: 'codex',
    label: 'Codex',
    root: '.codex',
    agentsDir: 'agents',
    agentExt: 'toml',
    globalBase: join(homedir(), '.codex'),
    skillsRoot: '.agents',
    skillsDir: 'skills',
    skillsGlobalBase: join(homedir(), '.agents'),
    rewriteAgent: rewriteCodexAgent,
    rewriteSkill: dropToBase,
  },
];

/** Absolute destination root for a target at a given scope. */
export function scopeRoot(target: Target, scope: Scope, cwd: string): string {
  return scope === 'global' ? target.globalBase : join(cwd, target.root);
}

/** Absolute skills destination root; falls back to `scopeRoot` when unset. */
export function scopeSkillsRoot(target: Target, scope: Scope, cwd: string): string {
  if (scope === 'global') return target.skillsGlobalBase ?? target.globalBase;
  return join(cwd, target.skillsRoot ?? target.root);
}

/** What `install` needs to place files for one target. */
export interface InstallTarget {
  readonly target: Target;
  readonly root: string;
  readonly skillsRoot?: string;
}
