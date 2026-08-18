<div align="center">

# swarmroom

**Portable coding agents — planner, critic, implementer, reviewer, verifier, fixer, researcher — for Cursor, opencode, Claude Code, and Codex.**

One source of truth. Four editors. A Red Team that actually red-teams. Zero lock-in.

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

**swarmroom** is that agent set, written once, installed everywhere — plus a
dedicated adversary whose only job is to attack the plan before you build it.

## What it is

Seven coding agents plus the skills that orchestrate them:

```
sw-pipeline → (trivial? implementer → verifier)
            → else planner → critic → implementer(s) → reviewer∥critic → fixer → verifier
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

- **`sw-critic`: a Red Team that has to find something, not confirm what's
  already there.** Runs on the plan *before* any code is written and again on
  the diff, hunting for logical flaws, unconfirmed business assumptions,
  architecture violations, and over-engineering — separate from
  `sw-code-reviewer` (style/rules) and `sw-verifier` (does it run). A Critical
  finding on the plan sends it back to `sw-planner`, not forward to
  implementation.
- **`sw-grilling`: a structured interview, not a question dump.** Stress-tests
  scope and assumptions in rounds capped at 3 questions each, skipped
  questions get priority next round instead of getting buried, and you can
  fast-track a round with `go with recommended`.
- **One prompt, four targets.** Edit `src/assets/agents/sw-planner.md` once;
  the installer rewrites frontmatter per editor (`readonly` → `mode: subagent`
  → TOML `developer_instructions`) so it stays valid everywhere without a
  second copy to maintain.
- **Findings you can pipe.** `sw-code-reviewer`, `sw-critic`, and
  `sw-verifier` emit one line per issue in a fixed format `sw-fixer` consumes
  directly — no free-text review to re-parse.
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

`swarmroom --help` lists flags. `swarmroom tasks` prints `.swarmroom/tasks.json`
status (`--json` for the raw graph); it does not run agents.

Then run `/sw-pipeline` (Cursor) or the matching skill in your editor. Codex
loads skills from `.agents/skills` (or `~/.agents/skills` when global).

## What you get

| Editor      | Agents                  | Skills                     |
| ----------- | ------------------------ | --------------------------- |
| Cursor      | `.cursor/agents/*.md`    | `.cursor/skills/<name>/`    |
| opencode    | `.opencode/agent/*.md`   | `.opencode/skills/<name>/`  |
| Claude Code | `.claude/agents/*.md`    | `.claude/skills/<name>/`    |
| Codex       | `.codex/agents/*.toml`   | `.agents/skills/<name>/`    |

Each skill folder includes `SKILL.md`. Skills that ship a helper script get
that file copied as-is next to it (today: `sw-transcribe-audio` → `transcribe.py`).

Project installs also copy `CODING_GUIDELINES.md` to the repo root. Global
installs skip that file. Codex global skills go to `~/.agents/skills`.

## Pipeline

```
sw-pipeline → (trivial? implementer → verifier)
            → else planner → critic → implementer(s) → reviewer∥critic → fixer → verifier
```

On **Critical** from the plan-stage critic, the pipeline replans — back to
`sw-planner`, never forward to `sw-implementer`. High/Medium don't block. For
non-trivial work, the pipeline runs `sw-grilling` first when that skill is
installed. After implementation, `sw-critic` and `sw-code-reviewer` run in
parallel (both read-only); either reporting Critical routes to `sw-fixer`
(max 2 passes), then `sw-verifier`.

## Skills

| Skill              | Role                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw-pipeline`        | Runs the agent sequence end to end. Does not substitute its own judgement for the specialists.                                                             |
| `sw-spec`            | Writes a lightweight spec under `docs/specs/<slug>.md` in the target project root, then hands off to `sw-pipeline`. Confirms before writing; never overwrites silently. |
| `sw-grilling`        | Stress-tests a plan, decision, or feature until you share one understanding — in capped, ordered rounds instead of one giant question dump. Doesn't write code. |
| `sw-transcribe-audio`| Turns a local audio file (mp3, wav, m4a, ogg/opus, including WhatsApp voice notes) into text on your machine. Needs Python `faster-whisper`, OS `ffmpeg`, and a first-run download of the Whisper `large-v3-turbo` model (~809MB). |

## Agents

| Agent                | Writes? | Role                                                                                                                                       |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sw-planner`           | no      | Plan any non-trivial change before editing                                                                                                 |
| `sw-critic`            | no      | Adversarial Red Team critique of plans and implementations — logical failures, unconfirmed assumptions, architecture violations, YAGNI — separate from style review (`sw-code-reviewer`) or verify-runs (`sw-verifier`) |
| `sw-implementer`       | yes     | Writes code to the repo's standards, then runs checks                                                                                       |
| `sw-code-reviewer`     | no      | Reviews diffs; one `FINDING` line per issue                                                                                                 |
| `sw-verifier`          | no      | Confirms the work exists, is wired, and passes tests                                                                                        |
| `sw-fixer`             | yes     | Fixes findings, severity-first, max two passes each                                                                                         |
| `sw-researcher`        | no      | Answers codebase questions with cited evidence                                                                                              |
| `sw-web-researcher`    | no      | Answers web/docs questions with cited URLs                                                                                                  |

`sw-researcher` and `sw-web-researcher` are on-demand. They are not stages in
`sw-pipeline`.

## Findings contract

`sw-code-reviewer`, `sw-critic`, and `sw-verifier` emit, and `sw-fixer`
consumes, one line per finding:

```
FINDING <N> | <Critical|High|Medium> | <file:line> | <rule> | <description>
```

Severity: `Critical` = must fix before merge; `High` = fix soon; `Medium` =
address when possible.

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
└── assets/           # the markdown you install (source of truth)
    ├── artifacts/CODING_GUIDELINES.md
    ├── skills/{sw-pipeline,sw-spec,sw-grilling,sw-transcribe-audio}/
    └── agents/sw-*.md
```

## Development

```bash
npm install
npm run types    # tsc --noEmit type check
npm test         # node:test suite
npm run setup    # run the CLI (alias for `node src/cli.ts`)
npm run build    # bundle CLI to dist/cli.js (required for npm publish / npx)
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

The only tracked source of agent/skill content is `src/assets/`. Everything
under `.cursor/`, `.claude/`, `.opencode/`, `.codex/`, and `.agents/` is a
gitignored, installer-generated copy — never edit those directly.

## FAQ

**Does this call any external API or LLM?** No. It's a file installer. The
agents run inside whichever tool you install them into; swarmroom itself
makes no network calls (the one exception is `sw-transcribe-audio`'s one-time
model download, which runs entirely on your machine after that).

**Why a separate critic instead of asking the reviewer to look for logic
bugs too?** Because a reviewer checking style rules and an adversary looking
for reasons the whole approach is wrong are different postures. Folding both
into one agent means the easier check (style) crowds out the harder one
(logic), and both stay shallow.

**Does it respect my repo's docs?** Every agent reads `AGENTS.md` /
`CODING_GUIDELINES.md` / `CONTEXT.md` at the repo root before acting and
treats them as overrides to the shipped baseline.

## License

[MIT](./LICENSE)
