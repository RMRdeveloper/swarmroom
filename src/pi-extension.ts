import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { createPipeline } from './app.ts';
import type { GrillingAnswer, GrillingQuestion } from './core/grilling.ts';
import type {
  PipelineObserver,
  PipelineStageEvent,
} from './core/orchestrator.ts';
import type { PipelineResult } from './core/types.ts';
import { formatPiCommandHelp, parsePiCommand } from './pi-command.ts';

const VERSION = '5.0.0';
const TRACE_TYPE = 'sideroom:run';
const STATUS_KEY = 'sideroom';
const PROGRESS_WIDGET_KEY = 'sideroom-progress';
const RECOMMENDATION_PREFIX = 'Use recommendation: ';
const CUSTOM_ANSWER = 'Write a different answer…';
const PIPELINE_PHASES: readonly PipelineStageEvent['phase'][] = [
  'grilling',
  'planner',
  'implementer',
  'reviewer',
  'verifier',
  'fixer',
];
const PHASE_LABELS: Readonly<Record<PipelineStageEvent['phase'], string>> = {
  grilling: 'Grilling',
  planner: 'Planner',
  implementer: 'Implementer',
  reviewer: 'Reviewer',
  verifier: 'Verifier',
  fixer: 'Fixer',
  pipeline: 'Pipeline',
};

/** Register the global `/sideroom` Pi command. */
export default function registerSideroom(pi: ExtensionAPI): void {
  pi.registerCommand('sideroom', {
    description: 'Run the isolated Sideroom coding pipeline in this Pi project',
    handler: async (args, context) => {
      const command = parsePiCommand(args);
      if (command.kind === 'help') {
        context.ui.notify(formatPiCommandHelp(), 'info');
        return;
      }
      if (command.kind === 'error') {
        context.ui.notify(`Sideroom: ${command.message}`, 'error');
        return;
      }

      const request = await requestFor(command.request, context);
      if (request === undefined) return;

      const trace: PipelineStageEvent[] = [];
      const progress = new PipelineProgress(context);
      const observe = createObserver(trace, progress);
      progress.start();
      try {
        const result = await createPipeline({
          dir: context.cwd,
          language: command.language,
          ...(modelReference(context) === undefined
            ? {}
            : { model: modelReference(context) }),
          ...(command.maxFixPasses === undefined
            ? {}
            : { maxFixPasses: command.maxFixPasses }),
          allowWrite: command.allowWrite,
          onStage: observe,
        }).run(request, (questions) =>
          answerQuestions(questions, context, progress),
        );
        recordRun(pi, context, command.language, result, trace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: PipelineResult = {
          status: 'failed',
          implementations: [],
          findings: [],
          summary: message,
        };
        recordRun(pi, context, command.language, result, [
          ...trace,
          { phase: 'pipeline', status: 'failed' },
        ]);
      } finally {
        progress.clear();
        context.ui.setStatus(STATUS_KEY, undefined);
      }
    },
  });
}

async function requestFor(
  request: string | undefined,
  context: ExtensionCommandContext,
): Promise<string | undefined> {
  if (request !== undefined && request.trim().length > 0) return request;
  if (!context.hasUI) {
    context.ui.notify('Sideroom needs a request after /sideroom.', 'error');
    return undefined;
  }
  const response = await context.ui.input(
    'What should Sideroom build?',
    'Describe the change',
  );
  return response === undefined || response.trim().length === 0
    ? undefined
    : response;
}

async function answerQuestions(
  questions: readonly GrillingQuestion[],
  context: ExtensionCommandContext,
  progress: PipelineProgress,
): Promise<readonly GrillingAnswer[] | undefined> {
  if (!context.hasUI) return undefined;
  const answers: GrillingAnswer[] = [];
  for (const [index, question] of questions.entries()) {
    const questionNumber = index + 1;
    progress.awaitDecision(questionNumber, questions.length);
    const answer = await answerQuestion(
      question,
      questionNumber,
      questions.length,
      context,
    );
    if (answer === undefined) return undefined;
    answers.push({
      id: question.id,
      answer,
    });
  }
  return answers;
}

/** Make the question and default choice visible instead of hiding them in an input placeholder. */
async function answerQuestion(
  question: GrillingQuestion,
  questionNumber: number,
  totalQuestions: number,
  context: ExtensionCommandContext,
): Promise<string | undefined> {
  const recommendationChoice = `${RECOMMENDATION_PREFIX}${question.recommendation}`;
  const choice = await context.ui.select(
    formatQuestionPrompt(question, questionNumber, totalQuestions),
    [recommendationChoice, CUSTOM_ANSWER],
  );
  if (choice === undefined) return undefined;
  if (choice === recommendationChoice) return question.recommendation;

  const answer = await context.ui.input(
    `${formatQuestionPrompt(question, questionNumber, totalQuestions)}\n\nCustom answer`,
    'Type your answer',
  );
  return answer === undefined || answer.trim().length === 0
    ? undefined
    : answer;
}

function formatQuestionPrompt(
  question: GrillingQuestion,
  questionNumber: number,
  totalQuestions: number,
): string {
  return [
    `Sideroom · Grilling question ${questionNumber}/${totalQuestions}`,
    question.title,
    question.question,
    `Recommended answer: ${question.recommendation}`,
  ].join('\n\n');
}

function createObserver(
  trace: PipelineStageEvent[],
  progress: PipelineProgress,
): PipelineObserver {
  return (event) => {
    trace.push(event);
    progress.report(event);
  };
}

function modelReference(context: ExtensionCommandContext): string | undefined {
  const model = context.model;
  return model === undefined ? undefined : `${model.provider}/${model.id}`;
}

function recordRun(
  pi: ExtensionAPI,
  context: ExtensionCommandContext,
  language: string,
  result: PipelineResult,
  trace: readonly PipelineStageEvent[],
): void {
  const details = {
    version: VERSION,
    source: 'sideroom-pi-extension',
    cwd: context.cwd,
    language,
    model: modelReference(context),
    status: result.status,
    trace,
  };
  pi.appendEntry(TRACE_TYPE, details);
  pi.sendMessage(
    {
      customType: TRACE_TYPE,
      display: true,
      content: formatRun(result, trace),
      details,
    },
    { triggerTurn: false },
  );
}

function formatRun(
  result: PipelineResult,
  trace: readonly PipelineStageEvent[],
): string {
  const phases = trace
    .filter((event) => event.status === 'completed')
    .map((event) => event.phase)
    .filter((phase, index, values) => values.indexOf(phase) === index);
  const files = [
    ...new Set(result.implementations.flatMap((item) => item.filesChanged)),
  ];
  return [
    `Sideroom ${result.status === 'completed' ? 'completed' : 'failed'}`,
    'Provenance: sideroom Pi extension → isolated Pi SDK role sessions.',
    `Roles completed: ${phases.length === 0 ? '-' : phases.join(', ')}`,
    `Files changed: ${files.length === 0 ? '-' : files.join(', ')}`,
    `Findings: ${String(result.findings.length)}`,
    result.summary,
  ].join('\n');
}

/** Render compact, durable progress for a run without involving Pi's parent agent. */
class PipelineProgress {
  private activePhase: PipelineStageEvent['phase'] | undefined;
  private awaitingDecision = false;
  private message = 'starting isolated Pi SDK role sessions';
  private readonly completed = new Set<PipelineStageEvent['phase']>();

  constructor(private readonly context: ExtensionCommandContext) {}

  start(): void {
    this.render();
  }

  report(event: PipelineStageEvent): void {
    const label = PHASE_LABELS[event.phase];
    const task = event.taskId === undefined ? '' : ` ${event.taskId}`;
    const round = event.round === undefined ? '' : ` (round ${event.round})`;
    this.activePhase = event.phase;
    this.awaitingDecision = event.status === 'awaiting-input';
    if (event.status === 'completed') this.completed.add(event.phase);
    this.message = stageMessage(event.status, `${label}${task}${round}`);
    this.render();
  }

  awaitDecision(questionNumber: number, totalQuestions: number): void {
    this.activePhase = 'grilling';
    this.awaitingDecision = true;
    this.message = `awaiting your decision (question ${questionNumber}/${totalQuestions})`;
    this.render();
  }

  clear(): void {
    this.context.ui.setWidget(PROGRESS_WIDGET_KEY, undefined);
  }

  private render(): void {
    this.context.ui.setStatus(STATUS_KEY, `Sideroom: ${this.message}`);
    this.context.ui.setWidget(
      PROGRESS_WIDGET_KEY,
      [
        'Sideroom pipeline',
        `Status: ${this.message}`,
        'Runtime: direct Pi SDK sessions · isolated roles · no fallback agents',
        '',
        ...PIPELINE_PHASES.map((phase) => this.renderPhase(phase)),
      ],
      { placement: 'aboveEditor' },
    );
  }

  private renderPhase(phase: PipelineStageEvent['phase']): string {
    if (this.completed.has(phase)) return `✓ ${PHASE_LABELS[phase]}`;
    if (this.activePhase === phase) {
      return this.awaitingDecision && phase === 'grilling'
        ? `● ${PHASE_LABELS[phase]} — awaiting your decision`
        : `● ${PHASE_LABELS[phase]} — running`;
    }
    return `○ ${PHASE_LABELS[phase]}`;
  }
}

function stageMessage(
  status: PipelineStageEvent['status'],
  subject: string,
): string {
  if (status === 'awaiting-input') return `${subject}: awaiting your decisions`;
  if (status === 'completed') return `${subject}: completed`;
  if (status === 'failed') return `${subject}: failed`;
  return `${subject}: running`;
}
