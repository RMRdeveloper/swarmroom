/**
 * Harness question contracts.
 *
 * Defines the adapter contract and question builders for the trivial-confirm
 * and grilling gates. A harness session invokes `gate.ask(...)`; this module
 * does not invoke or await it. Only two harnesses exist: opencode and pi.
 *
 * Tool mapping (ported from the original grilling skill so prompts stay
 * consistent):
 * - pi: `ask_user_question` — `header` (<=16 chars), `question` (ends with
 *   `?`), `options` (2-4 `{ label, description }`); first option carrying
 *   `(Recommended)` is the recommendation; freeform `Type something.` is
 *   auto-appended by the harness, never authored here.
 * - opencode: `question` — `questions[]` with `header`/`question`/`options`.
 *
 * Grilling itself stays conversational and always runs in the main
 * conversation, never delegated to a subagent. The runtime only models the
 * gate: it requires the settled understanding as input and refuses to plan
 * without it.
 */
import type { Harness } from './types.ts';

/** Single gate question. Shapes mirror both harness tools. */
export interface GateQuestion {
  /** Short chip shown next to the question (<=16 chars). */
  readonly header: string;
  /** Full question. Must end with `?`. */
  readonly question: string;
  /** Two to four closed options. First may carry `(Recommended)`. */
  readonly options: readonly GateOption[];
}

/** One closed answer option. */
export interface GateOption {
  readonly label: string;
  readonly description: string;
}

/**
 * Human gate owned by the harness session.
 * Resolves with the selected option label, or free text when the harness
 * allows a custom answer.
 */
export interface UserGate {
  readonly harness: Harness;
  ask(question: GateQuestion): Promise<string>;
}

/** Trivial-confirm question asked before skipping planner and grilling. */
export function trivialConfirmQuestion(): GateQuestion {
  return {
    header: 'Scope',
    question:
      'This looks like a trivial change (<=20 lines, 1 file, no new dependency, no design decision). Confirm it is trivial?',
    options: [
      {
        label: 'Non-trivial (Recommended)',
        description: 'Run grilling plus planner before any implementation.',
      },
      {
        label: 'Trivial',
        description: 'Skip grilling and planner; implement then verify directly.',
      },
    ],
  };
}

/** True when the human answer confirms the trivial path. */
export function answerConfirmsTrivial(answer: string): boolean {
  return answer.trim().toLowerCase() === 'trivial';
}
