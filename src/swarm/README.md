# Orchestrated swarm runtime

This directory is the new runtime. Agents do the work, `SwarmOrchestrator`
controls the process, and the original Markdown documents the intent.

## Scope

Supported harnesses: **opencode** and **pi**. Nothing else. The legacy
installer targets (Cursor, Claude Code, Codex) are untouched and keep working
from the original `.md` sources; the orchestrated runtime does not target them.

## Current system (analysis behind this port)

**Current agents** (`src/assets/agents/*.md`, installed per harness):

- `sw-planner` — prose plan plus a compact `.tasks` block graph. No code.
- `sw-implementer` — implements one task, runs tests/lint, reports result.
- `sw-code-reviewer` — read-only standards review, `FINDING` lines or `No findings`.
- `sw-verifier` — read-only skeptic: wiring, tests, edge cases, findings plus summary.
- `sw-fixer` — fixes findings severity-first, max 2 passes per finding, then re-review.
- `sw-researcher` / `sw-web-researcher` — read-only oracles (codebase / web),
  `Answer/Evidence/Confidence`. Support only; never scheduled automatically.

**Current flow** (`sw-pipeline` skill):

```text
request
  |-- trivial (<=20 lines, 1 file, no dep, no decision, user confirms)
  |     T1 implementer -> T2 verifier (no planner, no grilling, no reviewer)
  |
  |-- non-trivial
        grilling gate (main conversation, never a subagent)
        -> planner -> implement tasks in order
        -> reviewer || verifier (both read-only, parallel)
        -> fixer on Critical/High/Medium -> re-review
        -> done when No findings or only Low
```

`sw-critic` is manual-only and never auto-scheduled.

**Current tools** (reused, not reinvented): `tasks-format.ts` (`.tasks`
parsing), `tasks.ts` (graph, ready, failure propagation), `scheduler.ts`
(`selectRunnable`, writer-disjoint rule, `MAX_ATTEMPTS = 2`, `applyReplan`),
`findings-validator.ts` (strict `FINDING` vocab). The reviewer/verifier agents
validate model output through `validateFindings()`.

**Rules that lived hidden in Markdown and now live in code**:

- Trivial iff ALL conditions hold; doubt means ask, never assume (`isTrivial`).
- The trivial-confirm question blocks in code via `UserGate.ask()`.
- Non-trivial runs require a settled understanding; the orchestrator refuses to
  plan without it (grilling stays conversational, owned by the main session).
- Only Critical/High/Medium block; Low is informative (`hasBlockingFindings`).
- The fixer pass cap is an explicit loop bound (`maxQualityPasses`, default 2).
- Verification failure fails the run; agent/model errors become failed runs.
- No agent decides what runs next; `SwarmOrchestrator.run()` is the only router.

## Deliberate divergences from the `.md` flow

- Implementation tasks run sequentially in planner order: the safe subset of
  `selectRunnable` (parallel writers are an optimization, and parallel agents
  are out of MVP scope).
- Review scope is the whole change (implementations are combined into one
  review subject).
- The trivial path has no quality loop: verifier failure fails the run, exactly
  matching its explicit `T1 -> T2` graph.
- The pass cap is global per run rather than per finding; per-finding identity
  across passes needs finding tracking the MVP does not include.

## Layout

```text
src/swarm/
  types.ts        SwarmRun, structured agent results, isTrivial, blocking rule
  model.ts        ModelProvider: the only model boundary (fake in tests)
  harness.ts      UserGate + trivial-confirm question (opencode / pi mapping)
  agents/         planner, implementer, reviewer, verifier, fixer
  steps.ts        PersistedRun, nextAction, advanceRun: the single-step core
  run-store.ts    .swarmroom/runs/<runId>.swarm.json persistence
  orchestrator.ts SwarmOrchestrator: loops the step core end to end
  adapters/       concrete harness bindings (subprocess providers, stdin gate)
```

## Session-driven runs

For conversational driving (Pi `/sw-pipeline`, gentle-ai-like), the session
loops on the CLI-printed `next:` action while TypeScript keeps owning routing:

```text
swarm start --harness <opencode|pi> --request <text> --dir <path>
  [--model <id>] [--trivial] [--lines <n>] [--files <n>] [--adds-dep]
  [--design-decision] [--settled-understanding <text> | --settled-file <path>]
  [--max-passes <n>] [--timeout-s <n>]
swarm step --run <id> --dir <path> [--model <id>] [--timeout-s <n>] [--allow-write]
swarm status --run <id> --dir <path>
```

`swarm start` triages from flags only (trivial only with `--trivial`, else
non-trivial which needs a settled understanding; no stdin prompting — chat is
the UI). It persists `.swarmroom/runs/<runId>.swarm.json` and prints
`run: <id>` plus `next: <action>`. `swarm step` loads the run, executes
exactly one agent step, saves, and prints the updated summary plus `next:`.
`swarm status` prints phase, current agent, quality passes, and `next:`.
The session executes exactly the printed action, asks write approval before
`implement`/`fix` steps (`--allow-write` only when approved), and never
invents routing. `swarm run` keeps its background end-to-end behavior
untouched.

## Harness adapters

Each agent step spawns one harness CLI run in the target directory:

- opencode: `opencode run --format json --dir <dir> [-m <model>] [--auto] <prompt>`
- pi: `pi -p --no-session --mode json [--model <model>] [-a] -- <prompt>`

The full agent instructions travel inside the prompt, so no installed agent
files are needed and the `.md` sources stay documentation-only. Assistant
text is collected from the CLI JSON event stream and the single JSON payload
is extracted from it; agent modules validate that payload at their boundary.

```text
swarmroom swarm run --harness <opencode|pi> --request <text> [--dir <path>]
  [--model <id>] [--trivial | --non-trivial]
  [--lines <n>] [--files <n>] [--adds-dep] [--design-decision]
  [--settled-understanding <text> | --settled-file <path>]
  [--max-passes <n>] [--timeout-s <n>] [--allow-write]
```

Without `--trivial`/`--non-trivial` the command asks the trivial-confirm
gate on an interactive terminal, else defaults to non-trivial (which requires
a settled understanding from the grilling conversation). `--allow-write`
forwards opencode `--auto` / pi `-a` so implementer and fixer can write
files; it stays off by default and each model call burns harness tokens.

## Original Markdown

The `.md` agent/skill sources under `src/assets/` are the **original Swarmroom
behavioral documentation** and functional reference. The runtime never reads
them to decide what to run next; agents use only the short semantic
instructions extracted into each module.
