import type { Finding } from './types.ts';

const FINDING =
  /^FINDING (\d+) \| (Critical|High|Medium|Low) \| ([^|]+) \| ([^|]+) \| (.+)$/;
const FINDING_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

/** Parse the shared finding format and reject prose that cannot drive a fixer. */
export function parseFindings(
  source: string,
  stage = 'finding report',
): readonly Finding[] {
  const trimmed = source.trim();
  if (trimmed.length === 0 || trimmed === 'No findings') return [];

  const parsed = trimmed.split('\n').map((line, index) => {
    const match = FINDING.exec(line.trim());
    if (match === null) {
      throw new Error(`${stage} finding ${String(index + 1)} is malformed`);
    }
    const [, number, severity, fileLine, rule, description] = match;
    if (
      number === undefined ||
      severity === undefined ||
      fileLine === undefined ||
      rule === undefined ||
      description === undefined
    ) {
      throw new Error(`${stage} finding ${String(index + 1)} is malformed`);
    }
    return {
      number: Number(number),
      severity: severity as Finding['severity'],
      fileLine: fileLine.trim(),
      rule: rule.trim(),
      description: description.trim(),
    };
  });
  return validateFindings(parsed, stage);
}

/** Validate findings at every quality-stage boundary before they can drive a fixer. */
export function validateFindings(
  value: unknown,
  stage: string,
): readonly Finding[] {
  if (!Array.isArray(value)) {
    throw new Error(`${stage} findings must be an array`);
  }
  return value.map((finding, index) => validateFinding(finding, index, stage));
}

function validateFinding(
  value: unknown,
  index: number,
  stage: string,
): Finding {
  const number = index + 1;
  const record = recordOf(value, `${stage} finding ${String(number)}`);
  if (record.number !== number) {
    throw new Error(
      `${stage} finding ${String(number)} field "number" must be ${String(number)}`,
    );
  }
  if (!isFindingSeverity(record.severity)) {
    throw new Error(
      `${stage} finding ${String(number)} field "severity" is invalid`,
    );
  }
  const fileLine = textField(record.fileLine, 'fileLine', number, stage);
  const rule = textField(record.rule, 'rule', number, stage);
  const description = textField(
    record.description,
    'description',
    number,
    stage,
  );
  return { number, severity: record.severity, fileLine, rule, description };
}

function recordOf(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function textField(
  value: unknown,
  field: string,
  number: number,
  stage: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `${stage} finding ${String(number)} field "${field}" must be non-empty text`,
    );
  }
  return value.trim();
}

function isFindingSeverity(value: unknown): value is Finding['severity'] {
  return (
    typeof value === 'string' &&
    FINDING_SEVERITIES.includes(value as Finding['severity'])
  );
}
