#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Allowed headings in exact order — English only. */
const ALLOWED_HEADINGS = [
  'Context',
  'Goal',
  'Non-goals',
  'Requirements',
  'Acceptance Criteria',
  'Constraints',
  'Open Questions',
];

const ALLOWED_SET = new Set(ALLOWED_HEADINGS);

/** Slug pattern: kebab-case [a-z0-9-], 1..60 chars. */
const SLUG_RE = /^[a-z0-9-]+$/;

/** Centralized regex patterns — single source of truth. */
const PATTERNS = {
  SLUG: SLUG_RE,
  HEADING: /^##\s+(.*\S)\s*$/,
  TITLE: /^#\s+(.*\S)\s*$/,
  FRONTMATTER: /^---\s*$/,
};

/**
 * Extract slug from file path (basename without .md).
 * @param {string} filePath
 * @returns {string}
 */
function slugFromPath(filePath) {
  const base = path.basename(filePath);
  if (base.endsWith('.md')) return base.slice(0, -3);
  return base;
}

/**
 * Validate slug is kebab-case [a-z0-9-] and <=60 chars.
 * @param {string} slug
 * @returns {string | null} error or null
 */
function validateSlug(slug) {
  if (slug.length === 0) return 'slug must not be empty';
  if (slug.length > 60) return `slug "${slug}" exceeds 60 chars (${String(slug.length)})`;
  if (!PATTERNS.SLUG.test(slug)) return `slug "${slug}" must match [a-z0-9-] (kebab-case)`;
  return null;
}

/**
 * Parse headings from lines, returning ordered list.
 * @param {readonly string[]} lines
 * @returns {{ headings: Array<{ text: string, line: number }>, titleLine: number | null, titleText: string | null }}
 */
function parseHeadings(lines) {
  const headings = [];
  let titleLine = null;
  let titleText = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const titleMatch = PATTERNS.TITLE.exec(line);
    /** Only count single-# title, not ## */
    if (titleMatch && !line.startsWith('##')) {
      if (titleLine === null) {
        titleLine = i + 1;
        titleText = titleMatch[1] ?? '';
      }
      continue;
    }
    const m = PATTERNS.HEADING.exec(line);
    if (m && m[1] !== undefined) {
      headings.push({ text: m[1].trim(), line: i + 1 });
    }
  }
  return { headings, titleLine, titleText };
}

/**
 * Validate spec content.
 * @param {string} raw
 * @param {string} filePath
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSpec(raw, filePath) {
  const errors = [];

  /** Must end with \n */
  if (raw.length > 0 && !raw.endsWith('\n')) {
    errors.push('file must end with \\n');
  }

  /** No frontmatter --- */
  const firstLine = raw.split('\n')[0] ?? '';
  if (PATTERNS.FRONTMATTER.test(firstLine.trim())) {
    errors.push('frontmatter "---" is forbidden — spec is plain Markdown');
  }
  if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
    if (!errors.includes('frontmatter "---" is forbidden — spec is plain Markdown')) {
      errors.push('frontmatter "---" is forbidden — spec is plain Markdown');
    }
  }

  const slug = slugFromPath(filePath);
  const slugError = validateSlug(slug);
  if (slugError) errors.push(slugError);

  const lines = raw.split('\n');
  const { headings, titleLine, titleText } = parseHeadings(lines);

  /** Title required */
  if (titleLine === null) {
    errors.push('missing title "# <Title>" as first heading');
  } else if (titleText !== null && titleText.trim().length === 0) {
    errors.push('title must not be empty');
  }

  /** Check for unknown headings */
  for (const h of headings) {
    if (!ALLOWED_SET.has(h.text)) {
      errors.push(
        `line ${String(h.line)}: unknown heading "## ${h.text}" — allowed: ${ALLOWED_HEADINGS.join(', ')}`,
      );
    }
  }

  /** Check order — indices must be strictly increasing in ALLOWED_HEADINGS order */
  let lastIdx = -1;
  for (const h of headings) {
    const idx = ALLOWED_HEADINGS.indexOf(h.text);
    if (idx === -1) continue;
    if (idx <= lastIdx) {
      errors.push(
        `heading "## ${h.text}" out of order — expected order: ${ALLOWED_HEADINGS.join(' / ')}`,
      );
    }
    lastIdx = idx;
  }

  /** Check duplicates */
  const seen = new Set();
  for (const h of headings) {
    if (seen.has(h.text)) {
      errors.push(`duplicate heading "## ${h.text}"`);
    }
    seen.add(h.text);
  }

  /** Each section non-empty + Acceptance must contain Given/When/Then */
  /** Build map from heading text to content */
  const headingPositions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = PATTERNS.HEADING.exec(line);
    if (m && m[1] !== undefined && ALLOWED_SET.has(m[1].trim())) {
      headingPositions.push({ text: m[1].trim(), lineIdx: i });
    }
  }
  for (let idx = 0; idx < headingPositions.length; idx++) {
    const cur = headingPositions[idx];
    const next = headingPositions[idx + 1];
    if (!cur) continue;
    const start = cur.lineIdx + 1;
    const end = next ? next.lineIdx : lines.length;
    const sectionLines = lines.slice(start, end);
    const sectionRaw = sectionLines.join('\n').trim();
    if (sectionRaw.length === 0) {
      errors.push(`section "## ${cur.text}" must not be empty`);
      continue;
    }
    if (cur.text === 'Acceptance Criteria') {
      const hasGiven = sectionRaw.includes('Given');
      const hasWhen = sectionRaw.includes('When');
      const hasThen = sectionRaw.includes('Then');
      if (!hasGiven || !hasWhen || !hasThen) {
        errors.push('section "## Acceptance Criteria" must contain Given/When/Then');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse CLI args.
 * @param {readonly string[]} argv
 * @returns {{ file: string }}
 */
function parseArgs(argv) {
  let file;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        console.error('error: --file requires a path');
        process.exit(1);
      }
      file = next;
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log('Usage: node validate-spec.mjs --file <path>');
      console.log(
        'Validates spec Markdown: slug, headings order, frontmatter, trailing newline, Given/When/Then.',
      );
      process.exit(0);
    }
    if (a.startsWith('--')) {
      console.error(`error: unknown option: ${a}`);
      process.exit(1);
    }
  }
  if (file === undefined) {
    console.error('error: --file <path> is required');
    process.exit(1);
  }
  return { file };
}

function main() {
  const { file } = parseArgs(process.argv.slice(2));
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    console.error(
      `error: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const result = validateSpec(raw, file);
  if (result.valid) {
    console.log(`Valid spec: ${file}`);
    process.exit(0);
  }
  for (const err of result.errors) console.error(err);
  process.exit(1);
}

main();
