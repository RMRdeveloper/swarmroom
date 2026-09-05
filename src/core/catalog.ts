import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PipelineSkill } from './model.ts';
import type { AgentId, Language } from './types.ts';

/** Markdown role metadata and instructions loaded from the published package. */
export interface AgentDefinition {
  readonly id: AgentId;
  readonly description: string;
  readonly readonly: boolean;
  readonly instructions: string;
}

const agents = new Map<AgentId, AgentDefinition>();
const guidelines = new Map<Language, string>();
const skills = new Map<PipelineSkill, string>();
let sharedGuidelines: string | undefined;

/** Locate the installed package without relying on the caller's current directory. */
export function getPackageRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, 'package.json'))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('cannot locate Sideroom assets');
    directory = parent;
  }
  return directory;
}

/** Resolve shipped assets without relying on the caller's current directory. */
function assetsDir(): string {
  return path.join(getPackageRoot(), 'src', 'assets');
}

/** Load the source-of-truth role prompt. */
export function getAgentDefinition(id: AgentId): AgentDefinition {
  const cached = agents.get(id);
  if (cached !== undefined) return cached;

  const file = path.join(assetsDir(), 'agents', `${id}.md`);
  const definition = parseAgentDefinition(id, readFileSync(file, 'utf8'), file);
  agents.set(id, definition);
  return definition;
}

/** Load the coding-guideline layer selected for a run. */
export function getLanguageGuidelines(language: Language): string {
  const cached = guidelines.get(language);
  if (cached !== undefined) return cached;

  const file = path.join(
    assetsDir(),
    'artifacts',
    'guidelines',
    `${language}.md`,
  );
  const source = readFileSync(file, 'utf8').trim();
  if (source.length === 0)
    throw new Error(`coding guidelines are empty: ${language}`);
  guidelines.set(language, source);
  return source;
}

/** Load the language-neutral engineering policy shared by every run. */
export function getSharedGuidelines(): string {
  if (sharedGuidelines !== undefined) return sharedGuidelines;

  const file = path.join(assetsDir(), 'artifacts', 'GUIDELINES_TEMPLATE.md');
  const source = readFileSync(file, 'utf8').trim();
  if (source.length === 0) throw new Error('guidelines template is empty');
  sharedGuidelines = source;
  return source;
}

/** Load a fixed, package-owned skill without consulting Pi's global resources. */
export function getPackagedSkill(skill: PipelineSkill): string {
  const cached = skills.get(skill);
  if (cached !== undefined) return cached;

  const file = path.join(getPackageRoot(), 'skills', skill, 'SKILL.md');
  const source = readFileSync(file, 'utf8').trim();
  if (source.length === 0) throw new Error(`packaged skill is empty: ${skill}`);
  skills.set(skill, source);
  return source;
}

/** Combine the role and language layers while leaving routing in TypeScript. */
export function buildSystemPrompt(id: AgentId, language: Language): string {
  return [
    getAgentDefinition(id).instructions,
    '## Shared engineering policy',
    getSharedGuidelines(),
    '## Language policy',
    getLanguageGuidelines(language),
    'The language policy overrides conflicting language-specific examples or commands above.',
  ].join('\n\n');
}

/** Parse the small, fixed frontmatter subset used by the role assets. */
export function parseAgentDefinition(
  id: AgentId,
  source: string,
  file: string,
): AgentDefinition {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(
    source.replaceAll('\r\n', '\n'),
  );
  if (match === null)
    throw new Error(`agent definition must start with frontmatter: ${file}`);
  const [, header, body] = match;
  if (header === undefined || body === undefined)
    throw new Error(`invalid agent definition: ${file}`);

  const metadata = new Map<string, string>();
  for (const line of header.split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0)
      metadata.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      );
  }
  if (metadata.get('name') !== id)
    throw new Error(`agent name mismatch in ${file}`);
  const description = metadata.get('description');
  if (description === undefined || description.length === 0) {
    throw new Error(`agent description is missing in ${file}`);
  }
  const instructions = body.trim();
  if (instructions.length === 0)
    throw new Error(`agent instructions are empty in ${file}`);

  return {
    id,
    description,
    readonly: metadata.get('readonly') === 'true',
    instructions,
  };
}
