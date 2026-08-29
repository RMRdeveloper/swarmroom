#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const CHECK_FLAG = '--check';
const SRC_GUIDELINES = 'src/assets/artifacts/CODING_GUIDELINES.md';
const AGENTS = ['sw-planner', 'sw-implementer', 'sw-code-reviewer', 'sw-verifier', 'sw-fixer'];

const BASELINE_MARKER =
  '<!-- GENERATED from src/assets/artifacts/CODING_GUIDELINES.md — do not edit -->';
const TOOLING_MARKER = '<!-- GENERATED tooling — do not edit -->';



/**
 * Extract quick-reference table verbatim from CODING_GUIDELINES.md.
 * Keeps header row, separator and 20 data rows exactly as in source.
 * @param {string} content
 * @returns {string}
 */
function extractQuickReferenceTable(content) {
  const lines = content.split('\n');
  let start = -1;
  let end = -1;
  for (const [i, line_] of lines.entries()) {
    const line = line_ ?? '';
    if (
      line.trim() ===
      "| Do                                                 | Don't                                                                                       |"
    ) {
      start = i;
      break;
    }
    if (line.startsWith('| Do') && line.includes("| Don't")) {
      start = i;
      break;
    }
  }
  if (start === -1) throw new Error('Cannot extract quick-reference table header');
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('|')) {
      end = i;
      continue;
    }
    if (line.trim() === '' && end !== -1) break;
    if (end !== -1 && !line.startsWith('|')) break;
  }
  if (end === -1) throw new Error('Cannot extract quick-reference table end');
  return lines.slice(start, end + 1).join('\n');
}

/**
 * Build baseline generated block (verbatim table only — no bullet duplication).
 * @param {string} guidelinesContent
 * @returns {string}
 */
function buildBaselineBlock(guidelinesContent) {
  const table = extractQuickReferenceTable(guidelinesContent);
  return `${BASELINE_MARKER}\n\n## Baseline standards (apply when the repo defines nothing stricter)\n\nOne line per rule of the \`CODING_GUIDELINES.md\` quick reference. When the repo ships its own docs, those win.\n\n${table}\n\nIf GENERATED block missing, read \`src/assets/artifacts/CODING_GUIDELINES.md\` — file wins.`;
}

/**
 * Build deterministic tooling generated block.
 * @returns {string}
 */
function buildToolingBlock() {
  return `${TOOLING_MARKER}\n\n## Deterministic tooling\n\nAuthoritative binaries — do not infer or re-run with regex.\n\n- Comments: Run \`node .swarmroom/artifacts/check-comments.mjs --staged\` (fallback: \`node src/assets/artifacts/check-comments.mjs --staged\` in this repo) — authoritative, do not re-run with regex.\n- Findings: Validate findings with \`node src/assets/artifacts/findings-validator.mjs --file <path>\` or \`validateFindings()\` from \`src/shared/kernel/findings-validator.ts\` — strict vocab, do not invent rules.\n- Tasks: Agent must be one of \`src/shared/kernel/pipeline.ts\` agents — validated by \`assertTasksFileSafe\` / \`recordToTask\` in \`src/shared/kernel/tasks-format.ts\`, never invent.\n- Tasks parsing: Delegate to deterministic validator (\`recordToTask\`, \`assertTasksFileSafe\`) — do not interpret findings or tasks manually.\n\nIf GENERATED block missing, read \`CODING_GUIDELINES.md\` — file wins.`;
}

/**
 * Check if a line is a GENERATED marker.
 * @param {string} line
 * @returns {boolean}
 */
function isMarkerLine(line) {
  return line.trimStart().startsWith('<!-- GENERATED');
}

/**
 * Split body into sections by ^## heading or GENERATED marker.
 * Marker lines start a new section to keep baseline/tooling isolated.
 * @param {string} body
 * @returns {Array<{head: string, raw: string}>}
 */
function splitSections(body) {
  const lines = body.split('\n');
  /** @type {Array<{head: string, raw: string}>} */
  const sections = [];
  let currentHead = '';
  let currentLines = [];
  let preamble = [];
  let hasSeenHeading = false;
  for (const line of lines) {
    const isHeading = /^##\s+/.test(line);
    const marker = isMarkerLine(line);
    if (isHeading || marker) {
      if (!hasSeenHeading) {
        if (preamble.length > 0) sections.push({ head: '', raw: preamble.join('\n') });
        hasSeenHeading = true;
      } else if (currentHead !== '' || currentLines.length > 0) {
        // push previous section if it had content
        if (currentHead !== '' || currentLines.length > 0) {
          sections.push({ head: currentHead, raw: currentLines.join('\n') });
        }
        currentLines = [];
      }
      currentHead = line;
      currentLines = [line];
    } else {
      if (hasSeenHeading) currentLines.push(line);
      else preamble.push(line);
    }
  }
  if (hasSeenHeading && (currentHead !== '' || currentLines.length > 0)) {
    sections.push({ head: currentHead, raw: currentLines.join('\n') });
  } else if (!hasSeenHeading) {
    sections.push({ head: '', raw: preamble.join('\n') });
  }
  return sections;
}

/**
 * Check if raw block is baseline (generated marker or manual heading).
 * Only checks start of block, not containment, to avoid stripping mandatory that happens to contain marker elsewhere.
 * @param {string} raw
 * @returns {boolean}
 */
function isBaselineBlock(raw) {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith(BASELINE_MARKER)) return true;
  const firstLine = trimmed.split('\n', 1)[0]?.trim() ?? '';
  return /^##\s+Baseline standards/i.test(firstLine);
}

/**
 * Check if raw block is tooling.
 * @param {string} raw
 * @returns {boolean}
 */
function isToolingBlock(raw) {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith(TOOLING_MARKER)) return true;
  const firstLine = trimmed.split('\n', 1)[0]?.trim() ?? '';
  return /^##\s+Deterministic tooling/i.test(firstLine);
}

/**
 * Generate expected file content for one agent.
 * @param {string} rawExisting
 * @param {string} baselineBlock
 * @param {string} toolingBlock
 * @returns {string}
 */
function generateExpectedContent(rawExisting, baselineBlock, toolingBlock) {
  const fmMatch = /^---\n[\s\S]*?\n---\n/.exec(rawExisting);
  if (!fmMatch) throw new Error('Missing frontmatter ---');
  const frontmatter = fmMatch[0];
  const body = rawExisting.slice(frontmatter.length);
  const sections = splitSections(body);
  const filtered = sections.filter((s) => !isBaselineBlock(s.raw) && !isToolingBlock(s.raw));
  const insertIdx = filtered.findIndex((s) => /^##\s+Mandatory read-first/i.test(s.head));
  const normalizedFrontmatter = frontmatter.replace(/\n+$/, '\n');
  let outBody;
  if (insertIdx === -1) {
    const bodyStart = baselineBlock + '\n\n' + toolingBlock;
    const remaining = filtered.map((s) => s.raw).join('\n');
    const remainingTrimmed = remaining.replace(/^\n+/, '');
    outBody = remainingTrimmed.length > 0 ? bodyStart + '\n\n' + remainingTrimmed : bodyStart;
  } else {
    const before = filtered
      .slice(0, insertIdx + 1)
      .map((s) => s.raw)
      .join('\n');
    const after = filtered
      .slice(insertIdx + 1)
      .map((s) => s.raw)
      .join('\n');
    const beforeNorm = before.replace(/\n+$/, '');
    const afterTrimmed = after.replace(/^\n+/, '');
    const base = beforeNorm + '\n\n' + baselineBlock + '\n\n' + toolingBlock;
    outBody = after.trim().length > 0 ? base + '\n\n' + afterTrimmed : base;
  }
  let out = normalizedFrontmatter + outBody;
  if (!out.endsWith('\n')) out += '\n';
  out = out.replaceAll(/\n{3,}/g, '\n\n');
  return out;
}

/**
 * Sync one agent file.
 * @param {string} name
 * @param {string} guidelinesContent
 * @param {string} baselineBlock
 * @param {string} toolingBlock
 * @param {boolean} check
 * @returns {Promise<boolean>} true if changed/would change
 */
async function syncAgent(name, guidelinesContent, baselineBlock, toolingBlock, check) {
  const dest = `src/assets/agents/${name}.md`;
  if (!existsSync(dest)) throw new Error(`Missing agent file ${dest}`);
  const existing = await readFile(dest, 'utf8');
  const expected = generateExpectedContent(existing, baselineBlock, toolingBlock);
  if (check) {
    if (existing !== expected)
      throw new Error(`check failed: ${dest} is out of date (run sync:agents)`);
    return false;
  }
  if (existing !== expected) {
    await writeFile(dest, expected, 'utf8');
    return true;
  }
  return false;
}

async function main() {
  const check = process.argv.includes(CHECK_FLAG);
  const guidelinesContent = await readFile(SRC_GUIDELINES, 'utf8');
  const baselineBlock = buildBaselineBlock(guidelinesContent);
  const toolingBlock = buildToolingBlock();
  let changed = 0;
  for (const name of AGENTS) {
    const didChange = await syncAgent(name, guidelinesContent, baselineBlock, toolingBlock, check);
    if (didChange) changed++;
  }
  if (check) console.log('agents sync check: ok');
  else if (changed > 0) console.log(`synced ${String(changed)} agent(s)`);
  else console.log('agents sync: ok (no changes)');
}

await main();
