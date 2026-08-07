---
name: grilling
description: >-
  Relentlessly stress-test a plan, decision, or feature until shared understanding.
  Use for non-trivial work, or when the user asks to grill / /grilling.
argument-hint: What plan, decision, or feature to grill.
disable-model-invocation: true
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

If a fact lookup is in flight, treat it as an unsettled prerequisite: ask the
rest of the current frontier now; hold only the questions that depend on that
fact for a later round.

## Rounds and frontier

Work the tree in **rounds**. The **frontier** is every decision whose
prerequisites are already settled — the questions you can ask _now_ without
guessing unanswered ones.

Each round:

1. Ask the **whole** frontier.
2. Number every question.
3. Give your **recommended answer** for each.
4. Wait for the user's answers before the next round.

Format each question like this (plain markdown, no emoji):

```
**Q1 — <short title>**
<question body; multiple paragraphs and choices are fine>

Recommended: <your recommended answer>
```

A question whose answer depends on another still-open question in this round
belongs in a _later_ round, not this one. After each round, recompute the
frontier from the settled tree and continue.

## Exit: Settled understanding

The session is done when the frontier is empty — every branch visited, nothing
silently assumed. Then output a short **Settled understanding** block:

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
