#!/usr/bin/env node
// GENERATED — do not edit, source: src/shared/kernel/findings-validator.ts
import { existsSync, readFileSync } from 'node:fs';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const ALLOWED_RULES = [
  'Guard clauses',
  'Fail fast',
  'SRP',
  'DRY',
  'KISS',
  'YAGNI',
  'Composition',
  'Law of Demeter',
  'CQS',
  'Explicit error handling',
  'Immutability',
  'Null handling',
  'Testability',
  'Dependency direction',
  'Clear names',
  'No magic strings',
  'SOLID',
  'Validate once',
];

const PATTERNS = {
  FINDING_LINE:
    /^FINDING (\d+) \| (Critical|High|Medium|Low) \| ([\w/.\-_]+:\d+) \| ([^|]+) \| (.+)$/,
  FILE_LINE: /^[\w/.\-_]+:\d+$/,
};

const ALLOWED_SEVERITIES = new Set(SEVERITIES);
const ALLOWED_RULE_SET = new Set(ALLOWED_RULES);

function isSeverity(value) {
  return ALLOWED_SEVERITIES.has(value);
}

function splitPipeFields(line) {
  const parts = line.split('|');
  if (parts.length !== 5) return null;
  return parts.map((p) => p.trim());
}

function validateSequentialNumbers(findings) {
  if (findings.length === 0) return [];
  const errors = [];
  for (const [i, finding] of findings.entries()) {
    const expected = i + 1;
    const actual = finding.n;
    if (actual !== expected) {
      errors.push(
        `expected FINDING ${String(expected)} but got FINDING ${String(actual)} at line ${String(i + 1)}`,
      );
    }
  }
  return errors;
}

function getFindingLines(input) {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'No findings') return [];
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSingleLine(line, lineIndex) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return {};

  const match = PATTERNS.FINDING_LINE.exec(trimmed);
  if (!match) {
    return {
      error: `line ${String(lineIndex)}: malformed finding "${trimmed}" — expected "FINDING N | Severity | file:line | rule | description"`,
    };
  }

  const nRaw = match[1];
  const severityRaw = match[2];
  const fileLineRaw = match[3];
  const ruleRaw = match[4];
  const descriptionRaw = match[5];

  if (
    nRaw === undefined ||
    severityRaw === undefined ||
    fileLineRaw === undefined ||
    ruleRaw === undefined ||
    descriptionRaw === undefined
  ) {
    return { error: `line ${String(lineIndex)}: malformed finding "${trimmed}"` };
  }

  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1) {
    return { error: `line ${String(lineIndex)}: invalid FINDING number "${nRaw}"` };
  }

  if (!isSeverity(severityRaw)) {
    return { error: `line ${String(lineIndex)}: invalid severity "${severityRaw}"` };
  }

  const fileLine = fileLineRaw.trim();
  if (!PATTERNS.FILE_LINE.test(fileLine)) {
    return { error: `line ${String(lineIndex)}: invalid file:line "${fileLine}"` };
  }

  const rule = ruleRaw.trim();
  if (rule.length === 0) {
    return { error: `line ${String(lineIndex)}: rule cannot be empty` };
  }
  if (!ALLOWED_RULE_SET.has(rule)) {
    return {
      error: `line ${String(lineIndex)}: unknown rule "${rule}" — must be one of: ${ALLOWED_RULES.join(', ')}`,
    };
  }

  const description = descriptionRaw.trim();
  if (description.length === 0) {
    return { error: `line ${String(lineIndex)}: description cannot be empty` };
  }
  if (description.includes('|')) {
    return { error: `line ${String(lineIndex)}: description cannot contain "|"` };
  }

  return {
    finding: { n, severity: severityRaw, fileLine, rule, description },
  };
}

function parseFindings(input) {
  const lines = getFindingLines(input);
  const findings = [];
  for (const [i, line] of lines.entries()) {
    const result = parseSingleLine(line, i + 1);
    if (result.error) throw new Error(result.error);
    if (result.finding) findings.push(result.finding);
  }
  const seqErrors = validateSequentialNumbers(findings);
  if (seqErrors.length > 0) throw new Error(seqErrors[0]);
  return findings;
}

function validateFindings(input, opts) {
  const lines = getFindingLines(input);
  if (lines.length === 0) {
    return { valid: true, errors: [], findings: [] };
  }
  const findings = [];
  const errors = [];
  for (const [i, line] of lines.entries()) {
    const fields = splitPipeFields(line);
    if (!fields) {
      errors.push(
        `line ${String(i + 1)}: malformed finding "${line}" — expected 5 pipe-separated fields`,
      );
      continue;
    }
    const result = parseSingleLine(line, i + 1);
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    if (result.finding) findings.push(result.finding);
  }
  for (const err of validateSequentialNumbers(findings)) {
    errors.push(err);
  }
  if (opts?.strict) {
    for (const f of findings) {
      const file = f.fileLine.split(':', 1)[0];
      if (file === undefined) continue;
      if (!existsSync(file)) {
        errors.push(`line ${String(f.n)}: file does not exist "${file}"`);
      }
    }
  }
  return { valid: errors.length === 0, errors, findings };
}

function parseArgs(argv) {
  let file;
  let strict = false;
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
    if (a === '--strict') {
      strict = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log('Usage: findings-validator --file <path> [--strict]');
      process.exit(0);
    }
  }
  if (file === undefined) {
    console.error('error: --file <path> is required');
    process.exit(1);
  }
  return { file, strict };
}

function main() {
  const { file, strict } = parseArgs(process.argv.slice(2));
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    console.error(
      `error: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const result = validateFindings(raw, { strict });
  if (result.valid) {
    if (result.findings.length === 0) console.log('No findings');
    else console.log(`Valid findings: ${String(result.findings.length)}`);
    process.exit(0);
  }
  for (const err of result.errors) console.error(err);
  process.exit(1);
}

main();
