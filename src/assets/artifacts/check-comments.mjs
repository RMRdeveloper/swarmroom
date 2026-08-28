#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_GLOB = 'src/features/**/*.ts,src/shared/**/*.ts,src/cli/**/*.ts';
const DEFAULT_ALLOW = 'eslint,global';

// Centralized regex patterns — single source of truth.
// - SINGLE: line starting with slash-slash (JSDoc // is forbidden, only slash-star-star JSDoc allowed)
//   We check ^\s*// so URLs like https mid-line are not flagged.
// - BLOCK: line starting with slash-star not followed by * — precisely flags /* but allows /** JSDoc.
//   Previous ^\s*\/\*[^*] failed for slash-star-newline; (?!\*) handles it.
// - TODO: word-boundary TODO not followed by #digits on same line — avoids TODOS, TODO #123 is allowed.
// - ALLOW: built dynamically from --allow list; matches ^\s*//\s*(eslint|global)\b
const PATTERNS = {
  SINGLE: /^\s*\/\//,
  BLOCK: /^\s*\/\*(?!\*)/,
  TODO: /\bTODO\b(?![^\n]*#\d)/,
};

/** Build allowlist regex from comma-separated list like "eslint,global". */
function buildAllowRe(allowList) {
  const allow = allowList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return null;
  return new RegExp(
    `^\\s*//\\s*(?:${allow.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  );
}

/** True if line is allowlisted (// eslint, // global). */
function isAllowed(line, allowRe) {
  return allowRe ? allowRe.test(line) : false;
}

/**
 * Extra precision: // eslint-disable without " -- reason" is still a violation
 * even if allowlisted. Enforces "-- reason" description.
 */
function isEslintDisableWithoutReason(line) {
  if (!/\beslint-disable/.test(line)) return false;
  return !/--\s+.+/.test(line);
}

/**
 * Core predicate — single place for all violation logic.
 * isTestFile: only /* and TODO (as comment) are flagged, // is tolerated.
 */
function isViolation(line, isTestFile, allowRe) {
  const isSingle = PATTERNS.SINGLE.test(line);
  const isBlock = PATTERNS.BLOCK.test(line);
  const hasTodo = PATTERNS.TODO.test(line);
  // TODO only counts when it appears inside a comment line
  const isTodoInComment = hasTodo && (isSingle || isBlock);

  if (isTestFile) {
    if (isBlock) return true;
    if (isTodoInComment) return true;
    return false;
  }

  if (isSingle) {
    if (isAllowed(line, allowRe)) {
      // allowlisted but eslint-disable still needs "-- reason"
      if (isEslintDisableWithoutReason(line)) return true;
      return false;
    }
    return true;
  }
  if (isBlock) return true;
  if (isTodoInComment) return true;
  return false;
}

/** Collect violations from an array of lines for one file. */
function collectViolationsFromLines(lines, file, isTestFile, allowRe) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (isViolation(line, isTestFile, allowRe)) {
      out.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
    }
  }
  return out;
}

const WHY_RE = /workaround|invariant|hazard|WARNING|NOTE|HACK/i;

function isDeletableCommentText(text) {
  if (WHY_RE.test(text)) return false;
  return text.trim().length < 40;
}

function toJSDocText(raw) {
  const t = raw.trim();
  if (t.length === 0) return '';
  return t;
}

function fixLine(line, isTestFile, allowRe) {
  if (!isViolation(line, isTestFile, allowRe)) return line;
  const indent = (line.match(/^\s*/) ?? [''])[0] ?? '';
  if (PATTERNS.BLOCK.test(line)) {
    let fixed = line.replace(/^\s*\/\*/, '/**');
    fixed = fixed.replace(/\bTODO\b(?![^\n]*#\d)/, 'TODO #000 --');
    return fixed;
  }
  if (PATTERNS.SINGLE.test(line)) {
    if (isEslintDisableWithoutReason(line)) return `${line.trimEnd()} -- reason`;
    const body = line.replace(/^\s*\/\/\s?/, '');
    const bodyFixed = body.replace(/\bTODO\b(?![^\n]*#\d)/, 'TODO #000 --');
    if (isDeletableCommentText(bodyFixed)) return null;
    return `${indent}/** ${toJSDocText(bodyFixed)} */`;
  }
  if (PATTERNS.TODO.test(line)) return line.replace(/\bTODO\b(?![^\n]*#\d)/, 'TODO #000 --');
  return line;
}

function fixFileContent(content, isTestFile, allowRe) {
  const lines = content.split('\n');
  let fixedCount = 0;
  const nextLines = [];
  for (const line of lines) {
    if (!isViolation(line, isTestFile, allowRe)) {
      nextLines.push(line);
      continue;
    }
    const fixed = fixLine(line, isTestFile, allowRe);
    if (fixed === null) {
      fixedCount++;
      continue;
    }
    if (fixed !== line) fixedCount++;
    nextLines.push(fixed);
  }
  return { nextContent: nextLines.join('\n'), fixedCount };
}

function collectFixes(globs, allowList, dryRun) {
  const files = expandGlob(globs);
  const allowRe = buildAllowRe(allowList);
  let totalFixed = 0;
  const changed = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const isTestFile = file.endsWith('.test.ts');
    const { nextContent, fixedCount } = fixFileContent(content, isTestFile, allowRe);
    if (fixedCount === 0) continue;
    totalFixed += fixedCount;
    changed.push({ file, fixedCount });
    if (!dryRun) writeFileSync(file, nextContent, 'utf8');
  }
  return { totalFixed, changed };
}

function parseArgs(argv) {
  const out = {
    staged: false,
    all: false,
    glob: DEFAULT_GLOB,
    allow: DEFAULT_ALLOW,
    fix: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') out.staged = true;
    else if (a === '--all') out.all = true;
    else if (a === '--fix') out.fix = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--glob') out.glob = argv[++i] ?? '';
    else if (a.startsWith('--glob=')) out.glob = a.slice('--glob='.length);
    else if (a === '--allow') out.allow = argv[++i] ?? '';
    else if (a.startsWith('--allow=')) out.allow = a.slice('--allow='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/check-comments.mjs [--staged|--all] [--fix [--dry-run]] [--glob "a,b"] [--allow "eslint,global"]`,
      );
      process.exit(0);
    }
  }
  if (!out.staged && !out.all) out.all = true;
  return out;
}

function matchGlob(file, globs) {
  for (const g of globs) {
    const raw = g.trim();
    if (!raw) continue;
    if (raw.includes('**')) {
      const prefix = raw.split('**')[0] ?? '';
      const suffix = raw.split('**').pop() ?? '';
      const suffixClean = suffix.replace(/^\//, '');
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      if (suffixClean === '*.ts' && rest.endsWith('.ts')) return true;
      if (suffixClean === '*.ts' && rest.includes('/') && rest.endsWith('.ts')) return true;
      if (suffixClean.endsWith('.ts') && file.endsWith('.ts')) return true;
      continue;
    }
    if (raw === file) return true;
    if (raw.includes('*')) {
      const re = new RegExp(
        `^${raw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*')}$`,
      );
      if (re.test(file)) return true;
    }
  }
  return false;
}

function expandGlob(globs) {
  const files = [];
  const allPatterns = globs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && full.endsWith('.ts')) {
        const rel = full.startsWith('./') ? full.slice(2) : full;
        if (matchGlob(rel, allPatterns)) files.push(rel);
      }
    }
  }
  const bases = new Set();
  for (const g of allPatterns) {
    const base = g.split('/')[0] ?? '.';
    bases.add(base);
  }
  for (const b of bases) walk(b);
  return files.sort();
}

function getStagedHunks(globs, allowList) {
  let diff;
  try {
    diff = execSync('git diff -U0 --staged --no-color', { encoding: 'utf8' });
  } catch (error) {
    throw new Error(
      `Failed to get staged git diff: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!diff.trim()) {
    try {
      diff = execSync('git diff -U0 --no-color HEAD', { encoding: 'utf8' });
    } catch (error) {
      throw new Error(
        `Failed to get HEAD git diff: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  if (!diff.trim()) return [];

  const globsArr = globs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowRe = buildAllowRe(allowList);

  const violations = [];
  let currentFile = '';
  let lineNum = 0;
  for (const rawLine of diff.split('\n')) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = rawLine.slice(6);
      continue;
    }
    if (rawLine.startsWith('@@')) {
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
      lineNum = m ? Number(m[1]) : 0;
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      const content = rawLine.slice(1);
      const isTestFile = currentFile.endsWith('.test.ts');
      if (currentFile && !matchGlob(currentFile, globsArr)) {
        lineNum++;
        continue;
      }
      if (isViolation(content, isTestFile, allowRe)) {
        violations.push({
          file: currentFile,
          line: lineNum,
          text: content.trim(),
          rule: 'Comments',
        });
      }
      lineNum++;
    } else if (rawLine.startsWith(' ') || rawLine.startsWith('-')) {
      if (rawLine.startsWith(' ')) lineNum++;
    }
  }
  return violations;
}

function getAllFilesViolations(globs, allowList) {
  const files = expandGlob(globs);
  const allowRe = buildAllowRe(allowList);

  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const isTestFile = file.endsWith('.test.ts');
    violations.push(...collectViolationsFromLines(lines, file, isTestFile, allowRe));
  }
  return violations;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.fix) {
    const { totalFixed, changed } = collectFixes(args.glob, args.allow, args.dryRun);
    if (totalFixed === 0) {
      console.log('check-comments: ok');
      process.exit(0);
    }
    if (args.dryRun) {
      console.log(
        `check-comments: clean preview ${String(totalFixed)} fix(es) in ${String(changed.length)} file(s)`,
      );
      for (const c of changed) console.log(`  ${c.file}: ${String(c.fixedCount)}`);
      console.log('hint: run with --fix to apply');
      process.exit(1);
    }
    console.log(
      `check-comments: clean ${String(totalFixed)} fix(es) in ${String(changed.length)} file(s)`,
    );
    for (const c of changed) console.log(`  ${c.file}: ${String(c.fixedCount)}`);
    process.exit(0);
  }
  const violations = args.staged
    ? getStagedHunks(args.glob, args.allow)
    : getAllFilesViolations(args.glob, args.allow);

  if (violations.length === 0) {
    console.log('check-comments: ok');
    process.exit(0);
  }

  const locs = violations.map((v) => `${v.file}:${String(v.line)}`).join(', ');
  console.error(`check-comments: ${String(violations.length)} violation(s)`);
  console.error(
    `FINDING 1 | Medium | ${locs} | Comments | ${String(violations.length)} narrative // or /* or TODO without # in diff; convert to /** JSDoc or delete (quick-test: if deleting it leaves code just as clear)`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${String(v.line)} | ${v.text}`);
  }
  console.error(
    `\nAllowlist: // ${args.allow} ; JSDoc /** */ only for src. Tests laxo: only TODO without # and /*.`,
  );
  console.error(`Hint: run with --glob "src/**/*.ts" for other projects. Use --fix to auto-clean.`);
  process.exit(1);
}

main();
