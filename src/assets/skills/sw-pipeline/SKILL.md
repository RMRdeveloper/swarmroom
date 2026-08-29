---
name: sw-pipeline
description: Run the full sw-* pipeline — planner, implementer, code-reviewer, verifier, fixer.
argument-hint: Describe the feature/task to build or the diff to review.
disable-model-invocation: true
---

Run the sw-\* pipeline end to end via an internal Task Graph. Delegate each
stage to its subagent (`sw-planner`, `sw-implementer`,
`sw-code-reviewer`, `sw-verifier`, `sw-fixer`); do not substitute your own
judgement.

Read-first is mandatory for every coding agent: `CODING_GUIDELINES.md`,
`AGENTS.md` / `CLAUDE.md`, `CONTEXT.md` / `CONTEXT-MAP.md` when present.
Task instructions may narrow scope, files, and acceptance checks for this run; they do not override repo docs (`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present) or the baseline standards those docs leave in force.

## Interactive gate: sw-grilling

For every non-trivial request, **you** run `sw-grilling` directly in this
conversation before any planner task exists. `sw-grilling` is a user-facing
interview, never a subagent task: do not delegate it to `sw-planner`,
`sw-implementer`, `sw-fixer`, or any other agent.

`sw-grilling` asks the user questions in rounds and gives a recommended answer
per question. Only the user may accept or reject those recommendations — with
an explicit answer, or an explicit `go with recommended` / `recommended` —
never the pipeline and never any subagent. A recommendation is not a decision
until the user accepts it.

While any round is pending, **pause**: show the questions, wait for the user,
and do not start `sw-planner` or any implementation task. When
`sw-grilling` reaches a settled, user-confirmed understanding, pass that
settled understanding to `sw-planner` as input. The planner never runs
`sw-grilling` itself and never answers for the user.

## Adaptive triage

- **Trivial iff ALL:** (a) ≤20 lines, (b) exactly 1 file in `files`, (c) no new dep/import, (d) no decision in design tree, (e) user confirms `trivial` via `ask_user_question` (Pi/opencode/Claude). Else → non-trivial. Guard: if doubt, ask — never assume trivial, never bypass grilling+planner. Graph is `T1 sw-implementer` → `T2 sw-verifier`. No `sw-planner`, no `sw-grilling`.
- **Otherwise**: run the `sw-grilling` gate first (see above). After the user
  confirms the settled understanding, `sw-planner` runs (read-first, then
  plan). Planner emits a prose plan plus a compact task graph in blocks. No
  automatic `sw-critic` gate. You may suggest `/sw-critic` as an optional
  manual check at this point, but it never blocks the graph.

## Task graph — isolated per run (breaking change)

Every pipeline run owns its own graph file. At the start pick a
`runId` (slug of the feature/spec + `YYYYMMDD-HHmmss` + 4-char hash, e.g.
`add-auth-20260821-1420-a3f9`; allow the user to override via `runId:` in the
initial request). Then define `tasksFile = <runId>.tasks` (stored as
`.swarmroom/tasks/<runId>.tasks`).

Block format (no JSON): each task is a block of `field: value` lines, blocks separated by a blank line, file ends with `\n`. Fields: `id, status, dependsOn ("-" if empty), agent, title, description (defaults to title), files (comma or "-"), acceptance (";" or "-"), result, error, attempts`. Each line `^([A-Za-z]+): (.*)$` with one space after colon. `createGraph` validates duplicates/cycles/missing deps. Legacy JSON no longer supported — error `legacy JSON not supported — rename to .tasks`.

`tasksFile` MUST end with `.tasks` (reject otherwise). Validate via `assertTasksFileSafe` + `/\.tasks$/` — reuse `taskGraphPath()` in `src/features/tasks/task-store.ts`.

Use the task-graph interface with `--tasks-file` on **every** invocation.
Prefer `npx` so it works without a global install (production has no persistent
binary):

1. `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <tasksFile> [--dir <root>] validate` ALWAYS before `ready|set|replan` and after graph changes. Abort if not `Valid task graph: N tasks.`
2. `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <tasksFile> ready` to select the safe ready set.
3. `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <tasksFile> set <id> <status> [--result|--error]` for every status/result transition.
4. `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <tasksFile> replan --file <path>` for accepted replans (proposal file also in blocks).

If the `swarmroom` binary is already on `PATH` (global or `node_modules/.bin`
after `npm i @rmrdeveloper/swarmroom`), `swarmroom tasks --tasks-file <tasksFile> ...`
is equivalent — bare `swarmroom` fails in a clean `npx`-only checkout because
the binary is ephemeral (`command not found: swarmroom`). Never use bare
`npx swarmroom` (unscoped) — it resolves to a different npm package
(`swarmroom` vs `@rmrdeveloper/swarmroom`).

The orchestrator remains the sole authority that validates and applies graph
changes; agents may only propose blocks for replans. When neither
`npx --yes @rmrdeveloper/swarmroom` nor `swarmroom` is available (offline),
persist `.swarmroom/tasks/<tasksFile>` yourself (ids `T1..Tn`) and perform the
same validation, scheduling, transitions, and replanning manually. Tasks hold
execution data only: id, title, description, status, dependsOn, agent, files,
acceptance, result, error, attempts. No specs, no transcripts, no copied
guidelines.

N runs with distinct `runId` values never collide — do not reuse the same
`tasksFile` for parallel pipelines.

A task is not `completed` because the agent finished talking. Completion
requires the implementation, the agent's own checks, and any quality phase
the graph requires.

## Scheduling

Run the safe ready set (deterministic via `selectRunnable()` in `src/features/tasks/scheduler.ts` — do not re-implement disjoint check):

- dependencies must all be `completed`;
- two writers (`sw-implementer`, `sw-fixer`) run in parallel only if both
  declare `files` and the sets are disjoint;
- a writer without `files` runs alone among writers;
- non-writers may run in parallel with anyone.

## Quality phase

After implementation tasks: run `sw-code-reviewer` **in parallel** with
`sw-verifier` (both read-only). Findings stay one line:

`FINDING <N> | <Critical|High|Medium|Low> | <file:line> | <rule> | <description>`

Severity: Critical = must fix before merge; High = must fix before merge; Medium = must fix before merge; Low = informative — does not block pipeline.

If either reports Critical, High, or Medium → `sw-fixer` (max 2 passes per finding, severity-first) → then re-run `sw-code-reviewer` (+ `sw-verifier` if it was in the loop). Loop `reviewer/verifier → fixer → reviewer/verifier` until `No findings` or only `Low` remain.

If a stage reports only Low, do not loop — advance to completion.

`sw-critic` is never auto-scheduled; invoke `/sw-critic` manually when you want adversarial scrutiny. Its findings are advisory unless you explicitly route them to `sw-fixer`.

## Replanning

A subagent may propose blocks for `addTasks`/`addDependencies` (same block format; dependency block is `id` + `dependsOn` single id). Only you validate and apply. Agents do not mutate the graph.

## Token budget

Pass each subagent only its task plus `result` / `files` / findings of its
deps — use `humanReady()` + task result only. Never paste full `.tasks` or specs; never the full graph, transcripts, or copied guidelines — agents read those files themselves via tools.

Report each stage's output, not a summary.
