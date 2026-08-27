import { homedir } from 'node:os';
import path from 'node:path';

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

function dropToBase(source: string): string {
  const kept = source
    .split('\n')
    .filter((l) => !/^(readonly:|model:|argument-hint:|disable-model-invocation:)/.test(l.trim()));
  return kept
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trimStart();
}

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

function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('agent source is missing opening YAML frontmatter delimiter');
  }
  const closeAt = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (closeAt === -1) {
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
    const code = ch.codePointAt(0);
    if (code === undefined) throw new Error('unreachable: empty string codePoint');

    switch (ch) {
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
        encoded += code < 0x20 ? String.raw`\u${code.toString(16).padStart(4, '0')}` : ch;
      }
    }
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
    globalBase: path.join(homedir(), '.cursor'),
    rewriteAgent: (s) => s,
    rewriteSkill: (s) => s,
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

export function scopeRoot(target: Target, scope: Scope, cwd: string): string {
  return scope === 'global' ? target.globalBase : path.join(cwd, target.root);
}

export function scopeSkillsRoot(target: Target, scope: Scope, cwd: string): string {
  if (scope === 'global') return target.skillsGlobalBase ?? target.globalBase;
  return path.join(cwd, target.skillsRoot ?? target.root);
}

export interface InstallTarget {
  readonly target: Target;
  readonly root: string;
  readonly skillsRoot?: string;
}
