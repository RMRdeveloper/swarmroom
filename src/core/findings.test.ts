import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFindings, validateFindings } from './findings.ts';

test('validates and normalizes the complete finding contract', () => {
  const findings = validateFindings(
    [
      {
        number: 1,
        severity: 'High',
        fileLine: ' src/orders.ts:12 ',
        rule: ' Fail fast ',
        description: ' Reject invalid order identifiers. ',
      },
    ],
    'verifier stage',
  );

  assert.deepEqual(findings, [
    {
      number: 1,
      severity: 'High',
      fileLine: 'src/orders.ts:12',
      rule: 'Fail fast',
      description: 'Reject invalid order identifiers.',
    },
  ]);
});

test('rejects a finding that cannot be safely sent to the fixer', () => {
  assert.throws(
    () =>
      validateFindings(
        [
          {
            number: 1,
            severity: 'Unknown',
            fileLine: 'src/orders.ts:12',
            rule: 'Fail fast',
            description: 'Reject invalid order identifiers.',
          },
        ],
        'reviewer stage',
      ),
    /reviewer stage finding 1 field "severity" is invalid/,
  );
});

test('parses finding text through the same validator', () => {
  assert.throws(
    () =>
      parseFindings(
        'FINDING 2 | High | src/orders.ts:12 | Fail fast | Reject invalid order identifiers.',
        'verifier',
      ),
    /verifier finding 1 field "number" must be 1/,
  );
});
