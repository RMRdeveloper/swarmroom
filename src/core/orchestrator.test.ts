import assert from 'node:assert/strict';
import test from 'node:test';

import { SideroomOrchestrator } from './orchestrator.ts';

test('repairs blocking findings without creating project-local state', async () => {
  let reviewCalls = 0;
  let fixes = 0;
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({
        taskId: 'T1',
        filesChanged: ['src/a.ts'],
        summary: 'implemented',
      }),
    },
    reviewer: {
      id: 'sideroom-code-reviewer',
      run: async () => {
        reviewCalls += 1;
        return reviewCalls === 1
          ? [
              {
                number: 1,
                severity: 'High' as const,
                fileLine: 'src/a.ts:1',
                rule: 'Fail fast',
                description: 'missing guard',
              },
            ]
          : [];
      },
    },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: {
      id: 'sideroom-fixer',
      run: async () => {
        fixes += 1;
        return 'fixed';
      },
    },
  });

  const result = await pipeline.run('make a change');
  assert.equal(result.status, 'completed');
  assert.equal(fixes, 1);
  assert.equal(result.implementations[0]?.filesChanged[0], 'src/a.ts');
});

test('hands the settled grilling context to the planner in memory', async () => {
  let plannedRequest = '';
  let grillingCalls = 0;
  const grillingEvents: string[] = [];
  const pipeline = new SideroomOrchestrator({
    griller: {
      run: async () => {
        grillingCalls += 1;
        return grillingCalls === 1
          ? {
              status: 'questions' as const,
              questions: [
                {
                  id: 'Q1',
                  title: 'Scope',
                  question: 'Include existing clients?',
                  recommendation: 'Keep existing clients compatible.',
                },
              ],
            }
          : {
              status: 'settled' as const,
              summary: 'Existing clients stay compatible.',
            };
      },
    },
    planner: {
      id: 'sideroom-planner',
      run: async ({ request }) => {
        plannedRequest = request;
        return {
          summary: 'plan',
          tasks: [{ id: 'T1', title: 'change' }],
          verification: [],
        };
      },
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: { id: 'sideroom-code-reviewer', run: async () => [] },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: { id: 'sideroom-fixer', run: async () => 'not needed' },
    onStage: (event) => {
      if (event.phase === 'grilling') {
        grillingEvents.push(`${event.status}:${String(event.round)}`);
      }
    },
  });

  const result = await pipeline.run('Add an endpoint', async (questions) =>
    questions.map((question) => ({
      id: question.id,
      answer: question.recommendation,
    })),
  );

  assert.equal(result.status, 'completed');
  assert.equal(grillingCalls, 2);
  assert.match(plannedRequest, /Settled understanding/);
  assert.match(plannedRequest, /Existing clients stay compatible/);
  assert.deepEqual(grillingEvents, [
    'started:1',
    'awaiting-input:1',
    'started:2',
    'completed:2',
  ]);
});

test('emits host-owned role transitions for Pi provenance', async () => {
  const phases: string[] = [];
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: { id: 'sideroom-code-reviewer', run: async () => [] },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: { id: 'sideroom-fixer', run: async () => 'not needed' },
    onStage: (event) => phases.push(`${event.phase}:${event.status}`),
  });

  const result = await pipeline.run('make a change');

  assert.equal(result.status, 'completed');
  assert.deepEqual(phases, [
    'planner:started',
    'planner:completed',
    'implementer:started',
    'implementer:completed',
    'reviewer:started',
    'verifier:started',
    'reviewer:completed',
    'verifier:completed',
  ]);
});

test('rejects invalid findings before they reach the fixer', async () => {
  let fixerCalls = 0;
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: {
      id: 'sideroom-code-reviewer',
      run: async () =>
        [
          {
            number: 1,
            severity: 'High',
            fileLine: '',
            rule: 'Fail fast',
            description: 'Missing guard.',
          },
        ] as unknown as [],
    },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: {
      id: 'sideroom-fixer',
      run: async () => {
        fixerCalls += 1;
        return 'not reached';
      },
    },
  });

  const result = await pipeline.run('make a change');

  assert.equal(result.status, 'failed');
  assert.equal(fixerCalls, 0);
  assert.match(
    result.summary,
    /reviewer stage finding 1 field "fileLine" must be non-empty text/,
  );
});
