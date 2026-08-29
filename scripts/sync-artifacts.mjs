#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHECK_FLAG = '--check';

const SRC_VALIDATOR = 'src/shared/kernel/findings-validator.ts';
const DEST_VALIDATOR = 'src/assets/artifacts/findings-validator.mjs';
const SRC_GUIDELINES = 'src/assets/artifacts/CODING_GUIDELINES.md';
const DEST_GUIDELINES = 'CODING_GUIDELINES.md';
const CHECK_COMMENTS_WRAPPER = 'scripts/check-comments.mjs';
const CHECK_COMMENTS_EXPECTED = `#!/usr/bin/env node
import '../src/assets/artifacts/check-comments.mjs';
`;

/** Extract string array values from TS source like `export const NAME = ['a','b'] as const`. */
function extractStringArray(content, constName) {
  const re = new RegExp(String.raw`export const ${constName}\s*=\s*\[([\s\S]*?)\]\s*as const`);
  const m = re.exec(content);
  if (!m || m[1] === undefined) throw new Error(`Cannot extract ${constName}`);
  const body = m[1];
  const items = [];
  const itemRe = /'([^']*)'|"([^"]*)"/g;
  let match;
  while ((match = itemRe.exec(body)) !== null) {
    const val = match[1] ?? match[2] ?? '';
    items.push(val);
  }
  return items;
}

/** Extract regex literals for PATTERNS.FINDING_LINE and FILE_LINE from TS source. */
function extractPatterns(content) {
  const findingRe = /FINDING_LINE:\s*(\/.*\/)/;
  const fileRe = /FILE_LINE:\s*(\/.*\/)/;
  const f = findingRe.exec(content);
  const fi = fileRe.exec(content);
  if (!f || f[1] === undefined) throw new Error('Cannot extract PATTERNS.FINDING_LINE');
  if (!fi || fi[1] === undefined) throw new Error('Cannot extract PATTERNS.FILE_LINE');
  return { findingLine: f[1], fileLine: fi[1] };
}

function buildFindingsValidatorMjs(severities, allowedRules, patterns) {
  // Ensure deterministic formatting: inline severities, multiline rules indented 2 spaces
  const rulesFormatted = `[${allowedRules.map((r) => `\n  '${r.replaceAll("'", String.raw`\'`)}'`).join(',')},\n]`;
  const sevFormatted = `[${severities.map((s) => `'${s}'`).join(', ')}]`;

  return `#!/usr/bin/env node
// GENERATED — do not edit, source: ${SRC_VALIDATOR}
import { existsSync, readFileSync } from 'node:fs';

const SEVERITIES = ${sevFormatted};
const ALLOWED_RULES = ${rulesFormatted};

const PATTERNS = {
  FINDING_LINE:
    ${patterns.findingLine},
  FILE_LINE: ${patterns.fileLine},
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
        \`expected FINDING \${String(expected)} but got FINDING \${String(actual)} at line \${String(i + 1)}\`,
      );
    }
  }
  return errors;
}

function getFindingLines(input) {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'No findings') return [];
  return trimmed
    .split('\\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSingleLine(line, lineIndex) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return {};

  const match = PATTERNS.FINDING_LINE.exec(trimmed);
  if (!match) {
    return {
      error: \`line \${String(lineIndex)}: malformed finding "\${trimmed}" — expected "FINDING N | Severity | file:line | rule | description"\`,
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
    return { error: \`line \${String(lineIndex)}: malformed finding "\${trimmed}"\` };
  }

  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1) {
    return { error: \`line \${String(lineIndex)}: invalid FINDING number "\${nRaw}"\` };
  }

  if (!isSeverity(severityRaw)) {
    return { error: \`line \${String(lineIndex)}: invalid severity "\${severityRaw}"\` };
  }

  const fileLine = fileLineRaw.trim();
  if (!PATTERNS.FILE_LINE.test(fileLine)) {
    return { error: \`line \${String(lineIndex)}: invalid file:line "\${fileLine}"\` };
  }

  const rule = ruleRaw.trim();
  if (rule.length === 0) {
    return { error: \`line \${String(lineIndex)}: rule cannot be empty\` };
  }
  if (!ALLOWED_RULE_SET.has(rule)) {
    return {
      error: \`line \${String(lineIndex)}: unknown rule "\${rule}" — must be one of: \${ALLOWED_RULES.join(', ')}\`,
    };
  }

  const description = descriptionRaw.trim();
  if (description.length === 0) {
    return { error: \`line \${String(lineIndex)}: description cannot be empty\` };
  }
  if (description.includes('|')) {
    return { error: \`line \${String(lineIndex)}: description cannot contain "|"\` };
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
        \`line \${String(i + 1)}: malformed finding "\${line}" — expected 5 pipe-separated fields\`,
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
        errors.push(\`line \${String(f.n)}: file does not exist "\${file}"\`);
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
      \`error: cannot read \${file}: \${error instanceof Error ? error.message : String(error)}\`,
    );
    process.exit(1);
  }
  const result = validateFindings(raw, { strict });
  if (result.valid) {
    if (result.findings.length === 0) console.log('No findings');
    else console.log(\`Valid findings: \${String(result.findings.length)}\`);
    process.exit(0);
  }
  for (const err of result.errors) console.error(err);
  process.exit(1);
}

main();
`;
}

async function syncValidator(check) {
  const tsContent = await readFile(SRC_VALIDATOR, 'utf8');
  const severities = extractStringArray(tsContent, 'SEVERITIES');
  const allowedRules = extractStringArray(tsContent, 'ALLOWED_RULES');
  const patterns = extractPatterns(tsContent);
  const generated = buildFindingsValidatorMjs(severities, allowedRules, patterns);

  if (check) {
    if (!existsSync(DEST_VALIDATOR)) {
      throw new Error(`check failed: missing ${DEST_VALIDATOR} (run sync:artifacts)`);
    }
    const existing = await readFile(DEST_VALIDATOR, 'utf8');
    if (existing !== generated) {
      throw new Error(`check failed: ${DEST_VALIDATOR} is out of date (run sync:artifacts)`);
    }
    return;
  }

  await mkdir(path.dirname(DEST_VALIDATOR), { recursive: true });
  await writeFile(DEST_VALIDATOR, generated, 'utf8');
}

async function syncGuidelines(check) {
  const srcContent = await readFile(SRC_GUIDELINES, 'utf8');
  if (check) {
    if (!existsSync(DEST_GUIDELINES)) {
      throw new Error(`check failed: missing ${DEST_GUIDELINES} (run sync:artifacts)`);
    }
    const existing = await readFile(DEST_GUIDELINES, 'utf8');
    if (existing !== srcContent) {
      throw new Error(`check failed: ${DEST_GUIDELINES} is out of date (run sync:artifacts)`);
    }
    return;
  }
  await writeFile(DEST_GUIDELINES, srcContent, 'utf8');
}

async function syncCheckCommentsWrapper(check) {
  if (check) {
    if (!existsSync(CHECK_COMMENTS_WRAPPER)) {
      throw new Error(`check failed: missing ${CHECK_COMMENTS_WRAPPER}`);
    }
    const existing = await readFile(CHECK_COMMENTS_WRAPPER, 'utf8');
    if (existing !== CHECK_COMMENTS_EXPECTED) {
      throw new Error(
        `check failed: ${CHECK_COMMENTS_WRAPPER} is out of date (expected re-export)`,
      );
    }
    return;
  }
  // Ensure wrapper stays as re-export; only fix if drifted
  if (!existsSync(CHECK_COMMENTS_WRAPPER)) {
    await writeFile(CHECK_COMMENTS_WRAPPER, CHECK_COMMENTS_EXPECTED, 'utf8');
    return;
  }
  const existing = await readFile(CHECK_COMMENTS_WRAPPER, 'utf8');
  if (existing !== CHECK_COMMENTS_EXPECTED) {
    await writeFile(CHECK_COMMENTS_WRAPPER, CHECK_COMMENTS_EXPECTED, 'utf8');
  }
}

async function main() {
  const check = process.argv.includes(CHECK_FLAG);
  await syncValidator(check);
  await syncGuidelines(check);
  await syncCheckCommentsWrapper(check);
  if (check) {
    console.log('artifacts sync check: ok');
  } else {
    console.log(`synced ${DEST_VALIDATOR} and ${DEST_GUIDELINES}`);
  }
}

await main();
