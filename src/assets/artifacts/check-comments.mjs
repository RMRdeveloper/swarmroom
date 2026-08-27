#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_GLOB = 'src/features/**/*.ts,src/shared/**/*.ts,src/cli/**/*.ts';
const DEFAULT_ALLOW = 'eslint,global';

function parseArgs(argv) {
  const out = { staged: false, all: false, glob: DEFAULT_GLOB, allow: DEFAULT_ALLOW };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') out.staged = true;
    else if (a === '--all') out.all = true;
    else if (a === '--glob') out.glob = argv[++i] ?? '';
    else if (a.startsWith('--glob=')) out.glob = a.slice('--glob='.length);
    else if (a === '--allow') out.allow = argv[++i] ?? '';
    else if (a.startsWith('--allow=')) out.allow = a.slice('--allow='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/check-comments.mjs [--staged|--all] [--glob "a,b"] [--allow "eslint,global"]`,
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
  const allow = allowList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowRe = allow.length
    ? new RegExp(
        `^\\s*//\\s*(?:${allow.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      )
    : null;

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
      if (isTestFile) {
        if (/^\s*\/\*[^*]/.test(content)) {
          violations.push({
            file: currentFile,
            line: lineNum,
            text: content.trim(),
            rule: 'Comments',
          });
        } else if (/TODO(?!.*#\d)/.test(content)) {
          violations.push({
            file: currentFile,
            line: lineNum,
            text: content.trim(),
            rule: 'Comments',
          });
        }
        lineNum++;
        continue;
      }
      if (/^\s*\/\//.test(content)) {
        if (!allowRe || !allowRe.test(content)) {
          violations.push({
            file: currentFile,
            line: lineNum,
            text: content.trim(),
            rule: 'Comments',
          });
        }
      } else if (/^\s*\/\*[^*]/.test(content)) {
        violations.push({
          file: currentFile,
          line: lineNum,
          text: content.trim(),
          rule: 'Comments',
        });
      } else if (/TODO(?!.*#\d)/.test(content)) {
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
  const globsArr = globs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const files = expandGlob(globs);
  const allow = allowList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowRe = allow.length
    ? new RegExp(
        `^\\s*//\\s*(?:${allow.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      )
    : null;
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const isTestFile = file.endsWith('.test.ts');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (isTestFile) {
        if (/^\s*\/\*[^*]/.test(line))
          violations.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
        else if (/TODO(?!.*#\d)/.test(line))
          violations.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
        continue;
      }
      if (/^\s*\/\//.test(line)) {
        if (allowRe && allowRe.test(line)) continue;
        violations.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
      } else if (/^\s*\/\*[^*]/.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
      } else if (/TODO(?!.*#\d)/.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim(), rule: 'Comments' });
      }
    }
  }
  return violations;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
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
    `FINDING 1 | Medium | ${locs} | Comments | ${String(violations.length)} narrative // or /* or TODO without # in diff; convert to /** JSDoc */ or delete (quick-test: if deleting it leaves code just as clear)`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${String(v.line)} | ${v.text}`);
  }
  console.error(
    `\nAllowlist: // ${args.allow} ; JSDoc /** */ only for src. Tests laxo: only TODO without # and /*.`,
  );
  console.error(`Hint: run with --glob "src/**/*.ts" for other projects.`);
  process.exit(1);
}

main();
