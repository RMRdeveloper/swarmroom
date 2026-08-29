---
name: sw-grilling
description: >-
  Relentlessly stress-test a plan, decision, or feature until shared understanding.
  Use for non-trivial work, or when the user asks to grill / /sw-grilling.
argument-hint: What plan, decision, or feature to grill.
---

Interview the user until you share one understanding. Map the work as a
**design tree**: every decision branches into the decisions that hang off it.

## When to run

- **Do:** non-trivial plans, features, architecture choices, or ambiguous scope.
- **Skip:** trivial one-liners, pure typo/rename fixes, or work whose decisions
  are already settled in the conversation.

## Read-first (constraints, not guesses)

Before the first round, read only what exists at the repo root:

- `CODING_GUIDELINES.md`
- `AGENTS.md` / `CLAUDE.md`
- `CONTEXT.md` / `CONTEXT-MAP.md`

When present, treat them as hard constraints. Do not invent standards that
contradict them. If missing, say so and continue with the baseline the caller
already uses.

## Facts vs decisions

- **Facts** (code layout, scripts, existing APIs, docs) are your job — look them
  up with tools or a short research pass. Never ask the user for something you
  can verify.
- **Decisions** (scope, trade-offs, product intent) belong to the user — ask and
  wait.

If a fact lookup is in flight, treat it as an unsettled prerequisite: under the
round cap, ask eligible frontier questions that do not depend on that fact;
hold dependent questions for a later round.

## Tooling — always try the harness question tool first

Before each round, inspect the tools available in THIS harness. If a native
interactive question tool exists, you MUST use it instead of plain markdown.
Known tools by harness:

- **Pi**: `ask_user_question` — `header` (≤16 chars), `question` (ends with `?`), `options` (2-4 `{label, description, preview?}`); the first option with `(Recommended)` is the recommendation; freeform `Type something.` is auto-appended
- **opencode**: `question` — `questions[]` with `header`/`question`/`options`
- **Claude Code**: `AskUserQuestion` — `questions[]` with `header`/`question`/`options`
- **Cursor**: `AskQuestion` (Plan Mode only)
- **Codex**: `ask_user_question` (legacy) / `request_user_input`
  If the harness is not listed, try whatever question tool it exposes — the requirement is generic.

Rules:

1. Prefer the native tool for every question in the batch. If the harness
   accepts multiple questions per tool call, a single call with ≤3 questions
   is valid. Otherwise use one tool call per question. Both satisfy the cap.
2. Map fields to the tool's schema:
   - Pi `ask_user_question`: `title` (`Qn — <short title>`) → `header`, `body` → `question`, `Recommended` → first `options[].label` with `(Recommended)` suffix and `description` explaining the trade-off
   - opencode/Claude `question`/`AskUserQuestion`: same mapping to `questions[]` — `header`/`question`/`options`
   - Always respect the tool's limits: Pi 2-4 options per question (1-4 questions per call), opencode/Claude 2-4 options, Cursor/Codex per their schema. Never emit reserved labels `Other`/`Type something.` — they are auto-appended.
3. If no question tool exists, or the tool call fails, fall back to plain
   markdown (no emoji) below — do not block the round. Never prioritize
   markdown when a tool is available.
4. `sw-grilling` MUST run in the main conversation / primary agent, never
   delegated to a subagent (`sw-planner`, `sw-implementer`, `sw-fixer`, etc.).
   Questions sent to a subagent are invisible to the user and get auto-accepted
   — this is forbidden. When auto-triggered by `sw-pipeline`, bubble the
   questions to the principal agent and pause there.

## Rounds and frontier

Work the tree in **rounds**. The **frontier** is the full set of every decision
whose prerequisites are already settled — questions you can ask _now_ without
guessing unanswered ones. Each round asks a **batch** ⊆ frontier (never dump
the full frontier).

**Cap:** at most **3** questions per round. If the frontier is larger, fill the
batch as follows (still under the cap and independence rule): include previously
skipped frontier items first (all that fit; at least one slot when any skipped
item is eligible), then fill remaining slots by which questions unblock the most
downstream work. Carry the rest.

Each round:

1. Pick ≤3 questions from the frontier using the skip-first then leverage rule
   above. The asked set must be **independent** — no asked Q depends on another
   still-open Q in that round (same-round dependency → later round).
2. Number questions continuously across rounds (never restart at 1). Re-asking a
   skipped decision keeps its original Q number; only new decisions get the next
   unused number.
3. Give a **recommended answer** for each.
4. Wait for the user before the next round (via the question tool when
   available; otherwise via markdown).

Format each question like this when falling back to markdown (plain markdown, no emoji):

```
**Q1 — <short title>**
<question body; multiple paragraphs and choices are fine>

Recommended: <your recommended answer>
```

When using the native tool, map the same fields (`title`, `body`,
`Recommended`) to the tool's parameters instead of emitting markdown — see Rule 2 for Pi/opencode/Claude mapping.

The user may answer in any order, skip and return later, reply
`go with recommended` to accept every recommendation in the **current** round,
or accept Recommended for one question with `recommended` / `go with recommended
for Qn`.

**Advance** only when every question in the current round is answered,
explicitly skipped, or covered by a full-round or per-question Recommended
acceptance. If the user answers some questions and is silent on others, do not
advance, do not assume, and do not restart numbering: briefly nudge only the
unresolved ones and wait. Skipped questions remain on the frontier until
answered, explicitly marked out of scope, or the user accepts Recommended for
them.

After each round, recompute the frontier from the settled tree and continue.

## Exit: Settled understanding

The session is done when the frontier is empty — every remaining branch is
settled or explicitly out of scope, nothing silently assumed. Then output a
short **Settled understanding** block:

- Decisions made (bullets)
- Out of scope
- Constraints from repo docs (if any)
- Open risks the user accepted

Do **not** implement, edit files, or start coding. Do not act on the design until
the user confirms this shared understanding.

## Handoff

After the user confirms:

- Prefer handing off to `sw-planner` so the settled understanding shapes the
  implementation plan.
- If another caller already owns the next step, return the Settled understanding
  to that caller instead.

Never substitute for `sw-code-reviewer`, `sw-verifier`, or `sw-fixer`.
