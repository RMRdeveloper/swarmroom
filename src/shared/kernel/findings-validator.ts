import { existsSync } from 'node:fs';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALLOWED_RULES = [
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
] as const;

export type AllowedRule = (typeof ALLOWED_RULES)[number];

export interface ParsedFinding {
  readonly n: number;
  readonly severity: Severity;
  readonly fileLine: string;
  readonly rule: string;
  readonly description: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly findings: readonly ParsedFinding[];
}

const PATTERNS = {
  FINDING_LINE:
    /^FINDING (\d+) \| (Critical|High|Medium|Low) \| ([\w/.\-_]+:\d+) \| ([^|]+) \| (.+)$/,
  FILE_LINE: /^[\w/.\-_]+:\d+$/,
} as const;

const ALLOWED_SEVERITIES: ReadonlySet<string> = new Set(SEVERITIES);
const ALLOWED_RULE_SET: ReadonlySet<string> = new Set(ALLOWED_RULES);

function isSeverity(value: string): value is Severity {
  return ALLOWED_SEVERITIES.has(value);
}

function splitPipeFields(line: string): readonly string[] | null {
  const parts = line.split('|');
  if (parts.length !== 5) return null;
  return parts.map((p) => p.trim());
}

function validateSequentialNumbers(findings: readonly ParsedFinding[]): readonly string[] {
  if (findings.length === 0) return [];
  const errors: string[] = [];
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

function getFindingLines(input: string): readonly string[] {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'No findings') return [];
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSingleLine(
  line: string,
  lineIndex: number,
): { finding?: ParsedFinding; error?: string } {
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
    finding: {
      n,
      severity: severityRaw,
      fileLine,
      rule,
      description,
    },
  };
}

/** Parse findings without file-existence checks. Throws on malformed line. Use validateFindings to collect errors without throwing. */
export function parseFindings(input: string): ParsedFinding[] {
  const lines = getFindingLines(input);

  const findings: ParsedFinding[] = [];
  for (const [i, line] of lines.entries()) {
    const result = parseSingleLine(line, i + 1);
    if (result.error) throw new Error(result.error);
    if (result.finding) findings.push(result.finding);
  }

  const seqErrors = validateSequentialNumbers(findings);
  if (seqErrors.length > 0) throw new Error(seqErrors[0]);

  return findings;
}

export function validateFindings(input: string, opts?: { strict?: boolean }): ValidationResult {
  const lines = getFindingLines(input);

  if (lines.length === 0) {
    return { valid: true, errors: [], findings: [] };
  }

  const findings: ParsedFinding[] = [];
  const errors: string[] = [];

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

  const valid = errors.length === 0;
  return { valid, errors, findings };
}
