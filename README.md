<div align="center">

# swarmroom

**Portable coding agents — planner, implementer, reviewer, verifier, fixer, researcher, web-researcher — for Cursor, opencode, Claude Code, and Codex.**

One source of truth. Four editors. Isolated task graphs for parallel pipelines. Zero lock-in.

[![CI](https://img.shields.io/github/actions/workflow/status/RMRdeveloper/swarmroom/ci.yml?branch=main)](https://github.com/RMRdeveloper/swarmroom/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40rmrdeveloper%2Fswarmroom.svg)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![npm downloads](https://img.shields.io/npm/dm/%40rmrdeveloper%2Fswarmroom.svg)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![node](https://img.shields.io/node/v/%40rmrdeveloper%2Fswarmroom.svg)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![license: MIT](https://img.shields.io/github/license/RMRdeveloper/swarmroom)](./LICENSE)

```bash
npx @rmrdeveloper/swarmroom
```

</div>

---

## The problem

AI coding tools all reinvent the same roles — a planner, a reviewer, a
verifier — and every team writes its own version, once per editor.
`AGENTS.md` gets copy-pasted between repos, prompts drift out of sync between
Cursor and Claude Code, and the model tends to accept its own first plan
without ever seriously trying to break it.

**swarmroom** is that agent set, written once, installed everywhere — with an
optional Red Team skill you can invoke manually when you want adversarial scrutiny.

## What it is

Seven coding agents plus the skills that orchestrate them:

```
sw-pipeline → (trivial? implementer → verifier)
            → else grilling → planner → implementer(s) → reviewer∥verifier → fixer → verifier (loop until no Critical|High|Medium)
```

Every agent carries the full standards baseline from `CODING_GUIDELINES.md`
(SOLID, DRY, KISS, YAGNI, fail-fast, Law of Demeter — one line per rule, no
fluff) and defers to your repo's own `AGENTS.md` / `CODING_GUIDELINES.md` /
`CONTEXT.md` when present. `sw-researcher` and `sw-web-researcher` sit outside
the pipeline as on-demand oracles, not stages.

A small TypeScript CLI installs the same set into whichever editors you
actually use — no SaaS, no account, no telemetry. It copies markdown (and
TOML, for Codex) into your editor's config directory and gets out of the way.

## Why teams reach for it

- **Parallel pipelines, no clobbering.** Each run gets its own `.swarmroom/tasks/<runId>.tasks` (blocks `field: value`, no JSON) via required `--tasks-file`; run N pipelines concurrently without overwriting.
- **`sw-grilling`: a structured interview, not a question dump.** Stress-tests
  scope and assumptions in rounds capped at 3 questions each, skipped
  questions get priority next round instead of getting buried, and you can
  fast-track a round with `go with recommended`.
- **One prompt, four targets.** Edit `src/assets/agents/sw-planner.md` once;
  the installer rewrites frontmatter per editor (`readonly` → `mode: subagent`
  → TOML `developer_instructions`) so it stays valid everywhere without a
  second copy to maintain.
- **Findings you can pipe.** `sw-code-reviewer` and `sw-verifier` emit one line per issue in a fixed format `sw-fixer` consumes directly — no free-text review to re-parse. `sw-critic` (manual skill) uses the same format.
- **Repo docs always win.** Every agent reads your `AGENTS.md` /
  `CODING_GUIDELINES.md` / `CONTEXT.md` fresh before acting, and says so
  explicitly when one is missing instead of guessing at conventions.
- **Idempotent by default.** Re-running the installer skips files that already
  exist unless you pass `--force`. Safe to wire into onboarding or CI.

## Quick start

```bash
npx @rmrdeveloper/swarmroom
```

Pick editors and whether to install in this project or your home directory.
Non-interactive:

```bash
npx @rmrdeveloper/swarmroom --cursor --opencode --claude --codex --force
npx @rmrdeveloper/swarmroom --global --codex --force
```

Or `npm i -g @rmrdeveloper/swarmroom`, then `swarmroom`. Re-run the same
command to update — existing files are skipped unless you pass `--force`.

**Via `skills.sh` (standalone skills):**

```bash
npx skills add RMRdeveloper/swarmroom
# or pick standalone skills (no subagent delegation)
npx skills add RMRdeveloper/swarmroom --skill sw-grilling
npx skills add RMRdeveloper/swarmroom --skill sw-critic
npx skills add RMRdeveloper/swarmroom --skill sw-spec
npx skills add RMRdeveloper/swarmroom --skill sw-transcribe-audio
```

`skills.sh` installs the `skills/` mirror (4 standalone skills: `sw-grilling`, `sw-spec`, `sw-critic`, `sw-transcribe-audio`). `sw-pipeline` is the orchestrator that delegates to 7 subagents (`sw-planner`, `sw-implementer`, …) and is available **only via `npx @rmrdeveloper/swarmroom`** (which installs both agents and skills). Use `skills.sh` for standalone skills, `npx @rmrdeveloper/swarmroom` for the full pipeline.

`swarmroom --help` (or `npx --yes @rmrdeveloper/swarmroom --help`) lists flags. `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <path>` prints `.swarmroom/tasks/<path>` status (blocks `field: value`); it does not run agents. When `swarmroom` is on `PATH` (`npm i -g` or `npm i @rmrdeveloper/swarmroom`), bare `swarmroom tasks --tasks-file <path>` is equivalent; `npx --yes @rmrdeveloper/swarmroom` is required in clean `npx`-only checkouts where the binary is ephemeral.

Then run `/sw-pipeline` (Cursor) or the matching skill in your editor. Codex
loads skills from `.agents/skills` (or `~/.agents/skills` when global).

## What you get

| Editor      | Agents                 | Skills                     |
| ----------- | ---------------------- | -------------------------- |
| Cursor      | `.cursor/agents/*.md`  | `.cursor/skills/<name>/`   |
| opencode    | `.opencode/agent/*.md` | `.opencode/skills/<name>/` |
| Claude Code | `.claude/agents/*.md`  | `.claude/skills/<name>/`   |
| Codex       | `.codex/agents/*.toml` | `.agents/skills/<name>/`   |

Each skill folder includes `SKILL.md`. Skills that ship a helper script get
that file copied as-is next to it (today: `sw-transcribe-audio` → `transcribe.py`).

Project installs also copy `CODING_GUIDELINES.md` to the repo root. Global
installs skip that file. Codex global skills go to `~/.agents/skills`.

## Pipeline

```
sw-pipeline → (trivial? implementer → verifier)
            → else grilling → planner → implementer(s) → reviewer∥verifier → fixer → verifier (loop until no Critical|High|Medium)
```

Each run is isolated by `runId` — e.g. `add-auth-20260821-1420-a3f9` → `.swarmroom/tasks/<runId>.tasks` via `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <runId>.tasks` (or `swarmroom tasks --tasks-file <runId>.tasks` when the binary is on `PATH`). Parallel runs with distinct `runId` never collide. Format: blocks `field: value` separated by a blank line, no JSON.

For non-trivial work, the pipeline runs `sw-grilling` first when that skill is installed. After implementation, `sw-code-reviewer` and `sw-verifier` run in parallel (both read-only); either reporting Critical, High, or Medium routes to `sw-fixer` (max 2 passes), then re-runs the reviewers. The loop `reviewer/verifier → fixer → reviewer/verifier` repeats until `No findings` or only `Low` remain. `sw-critic` is a manual skill (`/sw-critic`) and is never auto-scheduled.

## Skills

| Skill                 | Role                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw-pipeline`         | Runs the agent sequence end to end. Does not substitute its own judgement for the specialists.                                                                                                                                     |
| `sw-spec`             | Writes a lightweight spec under `docs/specs/<slug>.md` in the target project root, then hands off to `sw-pipeline`. Confirms before writing; never overwrites silently.                                                            |
| `sw-grilling`         | Stress-tests a plan, decision, or feature until you share one understanding — in capped, ordered rounds instead of one giant question dump. Doesn't write code.                                                                    |
| `sw-critic`           | Adversarial Red Team — manually stress-test a plan or diff for logical failures, assumptions, architecture and YAGNI. Not part of the automatic pipeline.                                                                          |
| `sw-transcribe-audio` | Turns a local audio file (mp3, wav, m4a, ogg/opus, including WhatsApp voice notes) into text on your machine. Needs Python `faster-whisper`, OS `ffmpeg`, and a first-run download of the Whisper `large-v3-turbo` model (~809MB). |

## Agents

| Agent               | Writes? | Role                                                  |
| ------------------- | ------- | ----------------------------------------------------- |
| `sw-planner`        | no      | Plan any non-trivial change before editing            |
| `sw-implementer`    | yes     | Writes code to the repo's standards, then runs checks |
| `sw-code-reviewer`  | no      | Reviews diffs; one `FINDING` line per issue           |
| `sw-verifier`       | no      | Confirms the work exists, is wired, and passes tests  |
| `sw-fixer`          | yes     | Fixes findings, severity-first, max two passes each   |
| `sw-researcher`     | no      | Answers codebase questions with cited evidence        |
| `sw-web-researcher` | no      | Answers web/docs questions with cited URLs            |

`sw-researcher` and `sw-web-researcher` are on-demand. They are not stages in
`sw-pipeline`. `sw-critic` is now a manual skill (`/sw-critic`), not an agent.

## Findings contract

`sw-code-reviewer` and `sw-verifier` emit, and `sw-fixer` consumes, one line per finding ( `sw-critic` uses the same format when invoked manually):

```
FINDING <N> | <Critical|High|Medium|Low> | <file:line> | <rule> | <description>
```

Severity: `Critical` = must fix before merge; `High` = must fix before merge; `Medium` = must fix before merge; `Low` = informative — does not block pipeline.

## Repository layout

```
src/
├── cli.ts            # entry: option parsing + orchestration
├── domain/
│   ├── pipeline.ts   # single source of the sw-* agent names + skills list
│   └── targets.ts    # Target configs (cursor|opencode|claude|codex) + frontmatter rewrites
├── io/
│   └── installer.ts  # copies assets to the target dir (idempotent)
├── cli/
│   ├── args.ts       # argv parsing + help text
│   ├── report.ts     # install summary output
│   ├── style.ts      # TTY-aware colors (picocolors)
│   └── prompts.ts    # interactive selection (stdlib readline)
├── assets/           # the markdown you install (source of truth)
│   ├── artifacts/CODING_GUIDELINES.md
│   ├── skills/{sw-pipeline,sw-spec,sw-grilling,sw-critic,sw-transcribe-audio}/
│   └── agents/sw-*.md
skills/               # spec-compliant mirror for skills.sh — only standalone skills (sw-pipeline excluded, needs agents)
├── sw-grilling/SKILL.md
├── sw-spec/SKILL.md
├── sw-critic/SKILL.md
└── sw-transcribe-audio/scripts/transcribe.py
```

## Development

```bash
npm install
npm run types    # tsc --noEmit type check
npm test         # node:test suite
npm run setup    # run the CLI (alias for `node src/cli.ts`)
npm run build    # bundle CLI to dist/cli.js (required for npm publish / npx)
npm run sync:skills        # regenerate skills/ mirror for skills.sh (or check with sync:skills:check)
```

TypeScript runs directly during development (Node's native type stripping,
requires Node ≥ 23.6); there is no build step for local work. The published
package ships a bundled `dist/cli.js` so `npx` and installs from npm only need
Node ≥ 20.

## Adding a tool or agent

- **New editor target:** add one `Target` entry in `src/domain/targets.ts` —
  the rest is automatic.
- **New agent:** add its markdown to `src/assets/agents/` and its name to
  `src/domain/pipeline.ts`.
- **New skill:** add `src/assets/skills/<name>/SKILL.md` and append the name
  to `skills` in `src/domain/pipeline.ts`.

The only tracked source of agent/skill content is `src/assets/`. `skills/` is a generated, spec-compliant mirror for `skills.sh` (`npx skills add` discovers `skills/*/SKILL.md`) — do not edit it by hand, run `npm run sync:skills` instead. Everything under `.cursor/`, `.claude/`, `.opencode/`, `.codex/`, and `.agents/` is a gitignored, installer-generated copy — never edit those directly.

## FAQ

**Does this call any external API or LLM?** No. It's a file installer. The
agents run inside whichever tool you install them into; swarmroom itself
makes no network calls (the one exception is `sw-transcribe-audio`'s one-time
model download, which runs entirely on your machine after that).

**Why is sw-critic a manual skill instead of a pipeline stage?** Because an adversary that always blocks the plan can be counter-productive to swarmroom's essence. Running it manually keeps adversarial scrutiny available without forcing a replan on every Critical. The reviewer (`sw-code-reviewer`, style/rules) and verifier (`sw-verifier`, wiring/tests) remain automatic; the Red Team runs only when you ask for it.

**Does it respect my repo's docs?** Every agent reads `AGENTS.md` /
`CODING_GUIDELINES.md` / `CONTEXT.md` at the repo root before acting and
treats them as overrides to the shipped baseline.

## License

[MIT](./LICENSE)
