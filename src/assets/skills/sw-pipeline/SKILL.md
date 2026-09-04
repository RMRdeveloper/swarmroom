---
name: sw-pipeline
description: Run the full sw-* pipeline — planner, implementer, code-reviewer, verifier, fixer.
argument-hint: Describe the feature/task to build or the diff to review.
disable-model-invocation: true
---

Drive the sw-* pipeline conversationally (`sw-planner`, `sw-implementer`, `sw-code-reviewer`, `sw-verifier`, `sw-fixer`). TypeScript owns all routing; you only execute the printed `next:` action.

Read-first is mandatory for every coding agent: `CODING_GUIDELINES.md`, `AGENTS.md` / `CLAUDE.md`, `CONTEXT.md` / `CONTEXT-MAP.md` when present. Task instructions may narrow scope, files, and acceptance checks for this run; they do not override repo docs (`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present) or the baseline standards those docs leave in force.

## Interactive gate: sw-grilling

For every non-trivial request, run `sw-grilling` directly in this conversation before any planner task exists. `sw-grilling` asks questions in rounds and gives a recommended answer per question. `sw-grilling` is a user-facing interview, never a subagent task: do not delegate it to `sw-planner`, `sw-implementer`, `sw-fixer`, or any other agent. While any round is pending, pause: show the questions, wait for the user, and do not start `sw-planner` or any implementation task. Only the user may accept or reject those recommendations with an explicit answer, or an explicit `go with recommended` — never the pipeline and never any subagent.

## 1. Triage in chat

Ask via the harness question tool (`ask_user_question` on Pi, `question` on opencode) to confirm trivial: trivial iff ALL hold — ≤20 lines, exactly 1 file, no new dep/import, no design decision, user confirms trivial. If in doubt, treat as non-trivial. No `sw-planner`, no `sw-grilling` on the trivial path.

## 2. Grill unless trivial

For non-trivial requests, the gate above applies: run `sw-grilling` in chat until a settled, user-confirmed understanding exists. It is required before `swarm start`.

## 3. Start the run

Call `swarmroom swarm start` with decided flags only — never prompt via stdin (chat is the UI). Prefer the `swarmroom` binary (global install); without one, prefix every command with `npx --yes @rmrdeveloper/swarmroom` (bare `swarmroom` is ephemeral via npx and bare `npx swarmroom` resolves to a different package):

```text
swarmroom swarm start --harness <opencode|pi> --request <text> --dir <path>
  [--model <id>] [--trivial] [--lines <n>] [--files <n>] [--adds-dep] [--design-decision]
  [--settled-understanding <text> | --settled-file <path>]
  [--max-passes <n>] [--timeout-s <n>]
```

Use `--trivial` only for the trivial path; otherwise non-trivial with a settled understanding (fail fast without it). The command persists `.swarmroom/runs/<runId>.swarm.json` and prints `run: <id>` plus `next: <action>`. Show the plan step result and ask the user for proceed approval before continuing.

## 4. Step loop

Loop on the CLI-printed `next:` action. Report each step result in chat. Execute EXACTLY that action — never skip, reorder, or invent routing:

```text
swarmroom swarm step --run <id> --dir <path> [--model <id>] [--timeout-s <n>] [--allow-write]
swarmroom swarm status --run <id> --dir <path>
```

Before `implement` or `fix` steps, ask for write approval in chat. Pass `--allow-write` only when approved; otherwise stop and report. Findings stay one line:

`FINDING <N> | <Critical|High|Medium|Low> | <file:line> | <rule> | <description>`

## 5. Finish

On `next: done` give a final report (what changed, files, verification). On `next: failed:<reason>` report the reason and stop. Reviewer never runs on the trivial path; verification failure ends it directly.
