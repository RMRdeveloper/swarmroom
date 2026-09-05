import assert from 'node:assert/strict';
import test from 'node:test';

import { createGriller } from './grilling.ts';
import type { ModelRequest } from './model.ts';

test('uses the packaged grilling skill and validates its question round', async () => {
  const calls: Array<{ readonly skill?: string; readonly input: unknown }> = [];
  const griller = createGriller({
    generate: async <T>(request: ModelRequest) => {
      calls.push({ skill: request.skill, input: request.input });
      return {
        status: 'questions',
        questions: [
          {
            id: 'Q1',
            title: 'Compatibility',
            question: 'Should the endpoint preserve v1 clients?',
            recommendation: 'Preserve v1 clients.',
          },
        ],
      } as T;
    },
  });

  const result = await griller.run({ request: 'Add endpoint', answers: [] });
  assert.equal(result.status, 'questions');
  assert.equal(calls[0]?.skill, 'sideroom-grilling');
  const call = calls[0];
  assert.ok(call);
  assert.equal((call.input as { request: string }).request, 'Add endpoint');
});
