import type {
  FixerInput,
  PipelineAgent,
  PlannerInput,
  QualityInput,
} from './agents.ts';
import { validateFindings } from './findings.ts';
import type {
  GrillingAgent,
  GrillingAnswer,
  GrillingQuestion,
} from './grilling.ts';
import type { Finding, Implementation, PipelineResult, Plan } from './types.ts';
import { hasBlockingFindings } from './types.ts';

/** A role transition emitted by the in-memory pipeline to its host UI. */
export interface PipelineStageEvent {
  readonly phase:
    | 'grilling'
    | 'planner'
    | 'implementer'
    | 'reviewer'
    | 'verifier'
    | 'fixer'
    | 'pipeline';
  readonly status: 'started' | 'awaiting-input' | 'completed' | 'failed';
  readonly taskId?: string;
  readonly round?: number;
}

/** Host-owned observer; it never writes pipeline state into the target project. */
export type PipelineObserver = (event: PipelineStageEvent) => void;

/** Dependencies used by the only pipeline currently scheduled by Swarmroom. */
export interface OrchestratorOptions {
  readonly planner: PipelineAgent<PlannerInput, Plan>;
  readonly implementer: PipelineAgent<
    { readonly task: Plan['tasks'][number]; readonly plan: string },
    Implementation
  >;
  readonly reviewer: PipelineAgent<QualityInput, readonly Finding[]>;
  readonly verifier: PipelineAgent<QualityInput, readonly Finding[]>;
  readonly fixer: PipelineAgent<FixerInput, string>;
  /** Optional design-tree gate that runs before planning. */
  readonly griller?: GrillingAgent;
  readonly onStage?: PipelineObserver;
  readonly maxFixPasses?: number;
  readonly maxGrillingRounds?: number;
}

/** Caller-owned interaction for one batch of product or scope decisions. */
export type GrillingAnswerer = (
  questions: readonly GrillingQuestion[],
) => Promise<readonly GrillingAnswer[] | undefined>;

/** In-memory orchestration: no task files, project initialization, or harness state. */
export class SwarmOrchestrator {
  private readonly options: OrchestratorOptions & {
    readonly maxFixPasses: number;
    readonly maxGrillingRounds: number;
  };

  constructor(options: OrchestratorOptions) {
    const maxFixPasses = options.maxFixPasses ?? 2;
    if (!Number.isInteger(maxFixPasses) || maxFixPasses < 1) {
      throw new Error('maxFixPasses must be an integer of at least 1');
    }
    const maxGrillingRounds = options.maxGrillingRounds ?? 8;
    if (!Number.isInteger(maxGrillingRounds) || maxGrillingRounds < 1) {
      throw new Error('maxGrillingRounds must be an integer of at least 1');
    }
    this.options = { ...options, maxFixPasses, maxGrillingRounds };
  }

  /** Plan, implement, review, verify, and repair in the caller's project directory. */
  async run(
    request: string,
    answerQuestions?: GrillingAnswerer,
  ): Promise<PipelineResult> {
    let implementations: readonly Implementation[] = [];
    let plan: Plan | undefined;
    let findings: readonly Finding[] = [];
    try {
      const settledRequest = await this.settleRequest(request, answerQuestions);
      this.report({ phase: 'planner', status: 'started' });
      plan = await this.options.planner.run({ request: settledRequest });
      this.report({ phase: 'planner', status: 'completed' });
      for (const task of plan.tasks) {
        this.report({
          phase: 'implementer',
          status: 'started',
          taskId: task.id,
        });
        const implementation = await this.options.implementer.run({
          task,
          plan: plan.summary,
        });
        this.report({
          phase: 'implementer',
          status: 'completed',
          taskId: task.id,
        });
        implementations = [...implementations, implementation];
      }
      const combined = combineImplementation(implementations);
      for (let pass = 0; pass <= this.options.maxFixPasses; pass += 1) {
        const qualityInput = { implementation: combined, plan: plan.summary };
        this.report({ phase: 'reviewer', status: 'started' });
        this.report({ phase: 'verifier', status: 'started' });
        const [review, verification] = await Promise.all([
          this.options.reviewer.run(qualityInput),
          this.options.verifier.run(qualityInput),
        ]);
        this.report({ phase: 'reviewer', status: 'completed' });
        this.report({ phase: 'verifier', status: 'completed' });
        findings = validateFindings(
          mergeFindings(
            validateFindings(review, 'reviewer stage'),
            validateFindings(verification, 'verifier stage'),
          ),
          'quality gate',
        );
        if (!hasBlockingFindings(findings)) {
          return {
            status: 'completed',
            plan,
            implementations,
            findings,
            summary: 'Completed with no blocking findings.',
          };
        }
        if (pass === this.options.maxFixPasses) break;
        this.report({ phase: 'fixer', status: 'started' });
        await this.options.fixer.run({
          implementation: combined,
          findings: validateFindings(findings, 'fixer input'),
        });
        this.report({ phase: 'fixer', status: 'completed' });
      }
      return {
        status: 'failed',
        plan,
        implementations,
        findings,
        summary: 'Blocking findings remain after the configured fixer passes.',
      };
    } catch (error) {
      this.report({ phase: 'pipeline', status: 'failed' });
      return {
        status: 'failed',
        ...(plan === undefined ? {} : { plan }),
        implementations,
        findings,
        summary: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Collect user-owned design decisions without writing a project-local run file. */
  private async settleRequest(
    request: string,
    answerQuestions: GrillingAnswerer | undefined,
  ): Promise<string> {
    const griller = this.options.griller;
    if (griller === undefined) return request;

    let answers: readonly GrillingAnswer[] = [];
    for (let round = 0; round < this.options.maxGrillingRounds; round += 1) {
      const roundNumber = round + 1;
      this.report({
        phase: 'grilling',
        status: 'started',
        round: roundNumber,
      });
      const result = await griller.run({ request, answers });
      if (result.status === 'settled') {
        this.report({
          phase: 'grilling',
          status: 'completed',
          round: roundNumber,
        });
        return `${request}\n\n## Settled understanding\n${result.summary}`;
      }
      this.report({
        phase: 'grilling',
        status: 'awaiting-input',
        round: roundNumber,
      });
      if (answerQuestions === undefined) {
        throw new Error(
          'Grilling needs user decisions; run swarmroom in an interactive terminal.',
        );
      }
      const roundAnswers = await answerQuestions(result.questions);
      if (roundAnswers === undefined) {
        throw new Error(
          'Grilling was cancelled before the design was settled.',
        );
      }
      assertAnswersCoverQuestions(result.questions, roundAnswers);
      answers = [...answers, ...roundAnswers];
    }
    throw new Error(
      'Grilling exceeded the configured maximum number of rounds.',
    );
  }

  private report(event: PipelineStageEvent): void {
    this.options.onStage?.(event);
  }
}

function assertAnswersCoverQuestions(
  questions: readonly GrillingQuestion[],
  answers: readonly GrillingAnswer[],
): void {
  const expected = new Set(questions.map((question) => question.id));
  if (
    answers.length !== questions.length ||
    answers.some(
      (answer) =>
        !expected.delete(answer.id) || answer.answer.trim().length === 0,
    ) ||
    expected.size !== 0
  ) {
    throw new Error(
      'Grilling answers must cover each current question exactly once.',
    );
  }
}

function combineImplementation(
  implementations: readonly Implementation[],
): Implementation {
  return {
    taskId: 'all',
    filesChanged: [
      ...new Set(implementations.flatMap((result) => result.filesChanged)),
    ],
    summary: implementations
      .map((result) => `${result.taskId}: ${result.summary}`)
      .join('\n'),
  };
}

function mergeFindings(
  review: readonly Finding[],
  verification: readonly Finding[],
): readonly Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of [...review, ...verification]) {
    unique.set(
      `${finding.fileLine}|${finding.rule}|${finding.description}`,
      finding,
    );
  }
  return [...unique.values()].map((finding, index) => ({
    ...finding,
    number: index + 1,
  }));
}
