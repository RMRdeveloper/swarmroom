#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = 'src/assets/skills';
const DEST_ROOT = 'skills';
const CHECK_FLAG = '--check';

// Only standalone skills (no subagent delegation) are published to skills.sh.
// sw-pipeline is excluded — it requires 7 agents via npm installer.
const SKILLS_SH_ALLOWLIST = new Set(['sw-grilling', 'sw-spec', 'sw-critic', 'sw-transcribe-audio']);

// Spec-allowed frontmatter keys
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

const LICENSE = 'MIT';

const DESCRIPTION_OVERRIDES = {
  'sw-pipeline':
    'Run the full sw-* pipeline via isolated Task Graph (grilling → planner → implementer → reviewer/verifier → fixer). Use when starting a non-trivial feature, plan or multi-agent work — delegates to sw-* subagents.',
};

const COMPATIBILITY_OVERRIDES = {
  'sw-transcribe-audio': 'Requires ffmpeg on PATH, Python 3 with faster-whisper via uv, and 809MB Whisper large-v3-turbo model on first run',
};

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) throw new Error('Missing frontmatter ---');
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Missing closing frontmatter ---');
  const fmRaw = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const lines = fmRaw.split('\n');
  const data = {};
  let currentKey = null;
  let inMultiline = false;
  let multilineBuffer = [];
  // Simple parser sufficient for our frontmatter shapes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inMultiline) {
      if (line.startsWith('  ') || line.startsWith('\t') || line.trim() === '') {
        multilineBuffer.push(line);
        continue;
      } else {
        // end multiline, assign
        data[currentKey] = multilineBuffer.join('\n').trim();
        inMultiline = false;
        currentKey = null;
        multilineBuffer = [];
        // fall through to parse this line
      }
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (val === '>-') {
      currentKey = key;
      inMultiline = true;
      multilineBuffer = [];
    } else if (val.startsWith('>')) {
      // folded
      currentKey = key;
      inMultiline = true;
      multilineBuffer = [];
    } else {
      // strip surrounding quotes if any
      let v = val.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      data[key] = v;
    }
  }
  if (inMultiline && currentKey) {
    data[currentKey] = multilineBuffer.join('\n').trim();
  }
  return { data, body };
}

function serializeFrontmatter(data) {
  const lines = ['---'];
  // deterministic order: name, description, license, compatibility, metadata, allowed-tools
  const order = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
  for (const k of order) {
    if (!(k in data)) continue;
    const v = data[k];
    if (k === 'description' && v.includes('\n')) {
      lines.push(`${k}: >-`);
      for (const l of v.split('\n')) lines.push(`  ${l}`);
    } else if (typeof v === 'string' && (v.includes(':') || v.includes('#') || v.includes('\n'))) {
      // quote if needed
      if (v.includes('\n')) {
        lines.push(`${k}: >-`);
        for (const l of v.split('\n')) lines.push(`  ${l}`);
      } else {
        lines.push(`${k}: \"${v.replace(/\"/g, '\\\"')}\"`);
      }
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  // any other allowed keys not in order
  for (const k of Object.keys(data)) {
    if (order.includes(k)) continue;
    lines.push(`${k}: ${data[k]}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function sanitizeFrontmatter(rawData, skillName) {
  const out = {};
  // name must match directory
  out.name = rawData.name ?? skillName;
  // description override or original
  let desc = DESCRIPTION_OVERRIDES[skillName] ?? rawData.description;
  if (!desc) throw new Error(`Missing description for ${skillName}`);
  out.description = desc;
  // license
  out.license = rawData.license ?? LICENSE;
  // compatibility override
  if (COMPATIBILITY_OVERRIDES[skillName]) {
    out.compatibility = COMPATIBILITY_OVERRIDES[skillName];
  } else if (rawData.compatibility) {
    out.compatibility = rawData.compatibility;
  }
  // preserve metadata/allowed-tools if present and allowed
  if (rawData.metadata) out.metadata = rawData.metadata;
  if (rawData['allowed-tools']) out['allowed-tools'] = rawData['allowed-tools'];
  return out;
}

function rewriteBodyForTranscribe(body) {
  // Update references from transcribe.py to scripts/transcribe.py in the published copy
  // Keep src/assets flat, but skills/ uses scripts/
  return body
    .replaceAll('transcribe.py <audio_path>', 'scripts/transcribe.py <audio_path>')
    .replaceAll('python3 transcribe.py', 'python3 scripts/transcribe.py')
    .replaceAll('where `transcribe.py` is', 'where `scripts/transcribe.py` is');
}

async function syncOne(skillName, check) {
  const srcDir = join(SRC_ROOT, skillName);
  const srcSkill = join(srcDir, 'SKILL.md');
  const raw = await readFile(srcSkill, 'utf8');
  const { data, body } = parseFrontmatter(raw);

  // Validate name matches dir
  if (data.name && data.name !== skillName) {
    throw new Error(`Skill ${skillName}: frontmatter name "${data.name}" must match directory "${skillName}"`);
  }

  const sanitized = sanitizeFrontmatter(data, skillName);
  let newBody = body;
  if (skillName === 'sw-transcribe-audio') {
    newBody = rewriteBodyForTranscribe(body);
  }
  const destDir = join(DEST_ROOT, skillName);
  const destSkill = join(destDir, 'SKILL.md');
  const newContent = serializeFrontmatter(sanitized) + newBody.replace(/^\n+/, '\n');

  if (check) {
    // check mode: compare existing
    if (!existsSync(destSkill)) {
      throw new Error(`check failed: missing ${destSkill} (run sync-skills.mjs)`);
    }
    const existing = await readFile(destSkill, 'utf8');
    if (existing !== newContent) {
      throw new Error(`check failed: ${destSkill} is out of date (run sync-skills.mjs)`);
    }
    // also check companion
    if (skillName === 'sw-transcribe-audio') {
      const destScript = join(destDir, 'scripts', 'transcribe.py');
      if (!existsSync(destScript)) throw new Error(`check failed: missing ${destScript}`);
      const srcScript = join(srcDir, 'transcribe.py');
      const srcContent = await readFile(srcScript, 'utf8');
      const destContent = await readFile(destScript, 'utf8');
      if (srcContent !== destContent) throw new Error(`check failed: ${destScript} out of date`);
    } else {
      // check no stray files
    }
    return;
  }

  await mkdir(destDir, { recursive: true });
  await writeFile(destSkill, newContent, 'utf8');

  // companion files
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'SKILL.md') continue;
    if (!entry.isFile()) continue;
    const srcPath = join(srcDir, entry.name);
    let destPath;
    if (skillName === 'sw-transcribe-audio' && entry.name === 'transcribe.py') {
      destPath = join(destDir, 'scripts', entry.name);
      await mkdir(join(destDir, 'scripts'), { recursive: true });
    } else {
      destPath = join(destDir, entry.name);
    }
    await cp(srcPath, destPath);
  }
  // Clean up stale flat transcribe.py if we moved to scripts/
  if (skillName === 'sw-transcribe-audio') {
    const stale = join(destDir, 'transcribe.py');
    if (existsSync(stale)) await rm(stale, { force: true });
  }
}

async function main() {
  const check = process.argv.includes(CHECK_FLAG);
  const skills = await readdir(SRC_ROOT, { withFileTypes: true });
  const allNames = skills.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const names = allNames.filter((n) => SKILLS_SH_ALLOWLIST.has(n));

  if (!check) {
    // clean old skills that no longer exist in src or allowlist
    if (existsSync(DEST_ROOT)) {
      const existing = await readdir(DEST_ROOT, { withFileTypes: true });
      for (const e of existing) {
        if (!e.isDirectory()) continue;
        if (!names.includes(e.name)) {
          await rm(join(DEST_ROOT, e.name), { recursive: true, force: true });
        }
      }
    }
  } else {
    // in check mode also verify that excluded skills are not present in dest
    if (existsSync(DEST_ROOT)) {
      const existing = await readdir(DEST_ROOT, { withFileTypes: true });
      for (const e of existing) {
        if (!e.isDirectory()) continue;
        if (!SKILLS_SH_ALLOWLIST.has(e.name)) {
          throw new Error(`check failed: ${join(DEST_ROOT, e.name)} should not be published to skills.sh (only standalone skills)`);
        }
      }
    }
  }

  for (const name of names) {
    await syncOne(name, check);
  }
  if (check) {
    console.log('skills sync check: ok');
  } else {
    console.log(`synced ${names.length} skills to ${DEST_ROOT}/ (standalone only, sw-pipeline excluded)`);
  }
}

await main();
