import assert from 'node:assert/strict';
import test from 'node:test';

import { createVerifier } from './agents.ts';
import type { ModelRequest } from './model.ts';

const QUALITY_INPUT = {
  implementation: {
    taskId: 'T1',
    filesChanged: ['src/orders.ts'],
    summary: 'Implemented the order flow.',
  },
  plan: 'Implement the order flow.',
};

test('verifier validates its serialized findings contract', async () => {
  const verifier = createVerifier({
    generate: async <T>(_request: ModelRequest) =>
      ({
        findings:
          'FINDING 1 | High | src/orders.ts:12 | Fail fast | Reject invalid order identifiers.',
        summary: 'The missing guard is reproducible.',
      }) as T,
  });

  const findings = await verifier.run(QUALITY_INPUT);

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, 'High');
});

test('verifier rejects a non-string findings field at its output boundary', async () => {
  const verifier = createVerifier({
    generate: async <T>(_request: ModelRequest) =>
      ({ findings: [], summary: 'No findings.' }) as T,
  });

  await assert.rejects(
    verifier.run(QUALITY_INPUT),
    /verifier output.findings must be non-empty text/,
  );
});
