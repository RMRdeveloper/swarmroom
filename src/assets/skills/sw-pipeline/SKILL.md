---
name: sw-pipeline
description: Run the full sw-* pipeline — planner, implementer, code-reviewer, verifier, fixer.
argument-hint: Describe the feature/task to build or the diff to review.
disable-model-invocation: true
---

Run the sw-\* pipeline end to end via an internal Task Graph. Delegate each
stage to its subagent (`sw-planner`, `sw-implementer`, `sw-code-reviewer`,
`sw-verifier`, `sw-fixer`); do not substitute your own judgement.

Read-first is mandatory for every coding agent: `CODING_GUIDELINES.md`,
`AGENTS.md` / `CLAUDE.md`, `CONTEXT.md` / `CONTEXT-MAP.md` when present.
Task instructions may narrow scope, files, and acceptance checks for this run; they do not override repo docs (`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present) or the baseline standards those docs leave in force.

## Adaptive triage

- **Trivial** (typo, mechanical rename, unambiguous one-liner): graph is
  `T1 sw-implementer` → `T2 sw-verifier`. No `sw-planner`, no grilling.
- **Otherwise**: `sw-planner` runs first (read-first, then plan). For
  non-trivial work, if a `grilling` skill is available, only the planner runs
  it. Planner emits a prose plan plus a compact JSON task graph.

## Task graph

Persist `.swarmroom/tasks.json` yourself (ids `T1..Tn`). Do not require the
`swarmroom` binary. Tasks hold execution data only: id, title, description,
status, dependsOn, agent, files, acceptance, result, error, attempts. No specs, no
transcripts, no copied guidelines.

A task is not `completed` because the agent finished talking. Completion
requires the implementation, the agent's own checks, and any quality phase
the graph requires.

## Scheduling

Run the safe ready set:

- dependencies must all be `completed`;
- two writers (`sw-implementer`, `sw-fixer`) run in parallel only if both
  declare `files` and the sets are disjoint;
- a writer without `files` runs alone among writers;
- non-writers may run in parallel with anyone.

## Quality phase

After implementation tasks: `sw-code-reviewer` → if Critical, `sw-fixer`
(max 2 passes) → `sw-verifier`. Findings stay one line:

`FINDING <N> | <Critical|High|Medium> | <file:line> | <rule> | <description>`

If a stage reports Critical findings, do not advance: loop implementer→fixer
until clean.

## Replanning

A subagent may propose `{ addTasks, addDependencies }`. Only you validate and
apply. Agents do not mutate the graph.

## Token budget

Pass each subagent only its task plus `result` / `files` / findings of its
deps. Never the full graph, transcripts, or copied guidelines — agents read
those files themselves.

Report each stage's output, not a summary.
