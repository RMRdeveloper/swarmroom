---
name: sw-grilling
description: Clarify a non-trivial feature, plan, or decision through dependency-aware question rounds before implementation.
license: MIT
---

# Grilling

Reach a shared understanding before a non-trivial change is planned or built.
Model the work as a **design tree**: each decision can unlock further decisions.
Do not silently choose a product, scope, or trade-off decision for the user.

## Read facts; ask for decisions

Read existing repository instructions, source, tests, package scripts, and any
`CONTEXT.md` or `CONTEXT-MAP.md` before the first round. Facts such as current
behavior, available commands, and domain vocabulary are yours to verify. Never
ask the user for a fact you can inspect.

When a context file exists, use its vocabulary exactly. A context term is a
domain concept, not a generic technical word. Prefer one canonical term; use
`Avoid:` terms to prevent synonyms from blurring a decision. If the repository
has multiple contexts, use its map to identify the relevant one and ask only
when the relationship remains unclear. Do not create context files or any
project-local Swarmroom state.

The user owns decisions: desired outcome, scope, compatibility, user-visible
behavior, priorities, and accepted trade-offs.

## Rounds and frontier

The **frontier** contains decisions whose prerequisites are already settled.
Ask no more than three independent frontier questions in one round. A question
that depends on another unanswered question belongs to a later round.

For every question:

- Explain the concrete decision and its observable consequence.
- Offer a recommended answer and why it best fits the known facts.
- Keep alternatives mutually exclusive and avoid asking a disguised fact lookup.
- Number questions continuously across rounds.

After each answer, update the design tree, record the decision, and recompute
the frontier. If the user accepts a recommendation, record the recommendation
as the decision. If a fact lookup is still pending, ask every independent
question that does not depend on it; do not block the entire round.

In a conversational interface, format a fallback round as:

```md
**Q1 — <short decision title>**
<question, alternatives, and relevant facts>

Recommended: <one answer and its trade-off>
```

Use a native question UI when the host provides one. Otherwise use the fallback
format and wait for the user's answer; never proceed because silence is
convenient.

## Completion and handoff

The grilling phase is complete only when the frontier is empty: each branch is
settled or explicitly out of scope. Then produce a compact **Settled
understanding** containing decisions, non-goals, repository constraints, and
risks the user accepted. Do not implement or plan until this is confirmed.

Hand the confirmed understanding to the planner. It constrains the plan; it is
not an implementation task.

## Swarmroom pipeline mode

When invoked by Swarmroom with a requested JSON schema, perform exactly one
round. Return only the requested JSON value:

- `status: "questions"` with one to three frontier questions, each with `id`,
  `title`, `question`, and `recommendation`; or
- `status: "settled"` with a concise `summary` suitable for the planner.

The caller supplies prior answers in the task context. Do not repeat settled
questions or make changes to the working tree.
