# AGENTS.md

This repo is the installer + source-of-truth for the portable `sw-*` coding
agents (planner, implementer, code-reviewer, verifier, fixer, researcher, web-researcher) and the
`sw-pipeline`, `sw-spec`, `sw-grilling`, `sw-critic`, and `sw-transcribe-audio` skills, installed into Cursor, opencode, Claude Code, or Codex.

## Source of truth (critical)

- The **only** tracked source of agent/skill content is `src/assets/`:
  - `src/assets/agents/*.md` — each embeds GENERATED baseline + tooling blocks from `src/assets/artifacts/CODING_GUIDELINES.md` via `scripts/sync-agents.mjs` (verified by `src/assets/agents/sync-agents.test.ts` and `npm run sync:agents:check`)
  - `src/assets/skills/<name>/` (`SKILL.md` plus optional companion files the installer copies as-is)
  - `src/assets/artifacts/CODING_GUIDELINES.md` — single source for the baseline table
  - `src/assets/artifacts/validate-spec.mjs` — deterministic spec validator (slug `[a-z0-9-]` ≤60, headings order, frontmatter forbidden, `Given/When/Then`); `findings-validator.mjs` / `check-comments.mjs` kept in sync via `scripts/sync-artifacts.mjs` (`npm run sync:artifacts:check`)
  - `src/shared/kernel/pipeline.ts`, `tasks-format.ts`, `findings-validator.ts` — deterministic kernels for agent/skill lists, `.tasks` parsing (`assertTasksFileSafe`, `recordToTask`), and `FINDING` validation
- `skills/` is a **generated, spec-compliant mirror** for `skills.sh` (`npx skills add` discovers `skills/*/SKILL.md`). It contains **only standalone skills** (`sw-grilling`, `sw-spec`, `sw-critic`, `sw-transcribe-audio`); `sw-pipeline` (orchestrator, delegates to 7 subagents) is excluded because `skills.sh` cannot install agents. Do NOT edit `skills/` by hand; run `npm run sync:skills` (and `npm run sync:skills:check` in CI) — it is derived from `src/assets/skills/` via `scripts/sync-skills.mjs`.
- `.cursor/`, `.claude/`, `.opencode/`, `.codex/`, `.agents/` are **gitignored installed copies** produced by the CLI (agents/skills rewired per editor via `src/features/installer/targets.ts`: Cursor `.cursor/agents`/`skills`, opencode `.opencode/agent`/`skills`, Claude `.claude/agents`/`skills`, Codex `.codex/agents`→TOML + `.agents/skills`). Do NOT edit them; a re-run of the installer overwrites them.
- The repo-root `CODING_GUIDELINES.md` is a **gitignored verbatim copy** of `src/assets/artifacts/CODING_GUIDELINES.md` produced by `npm run sync:artifacts` (and by the installer). `.swarmroom/artifacts/` (`check-comments.mjs`, `findings-validator.mjs`, `validate-spec.mjs` from `ARTIFACTS_ALLOWLIST` in `src/features/installer/installer.ts`) is also gitignored and installer-generated. Editing `src/assets/...` is the only change that matters.
- Deterministic invariants (must not drift): `tasksFile` MUST end with `.tasks` (`assertTasksFileSafe` + `/\.tasks$/`); trivial iff ALL (≤20 lines, 1 file, no dep/import, no design decision, user confirms via `ask_user_question`); `validate` ALWAYS before `ready|set|replan` and after graph changes; `sw-spec` ONLY writable path is `.swarmroom/specs/<slug>.md` (forbidden: `src/**`, `docs/**`, `.swarmroom/tasks/**`, `.swarmroom/artifacts/**`); agents carry GENERATED **Deterministic tooling** section — do not re-implement checks with regex.

## Commands

```
npm install
npm run types              # tsc --noEmit (type check)
npm run lint               # eslint . (strict + unicorn)
npm run format:check       # prettier --check .
npm test                   # node --test 'src/**/*.test.ts'
npm run check:comments     # deterministic gate: JSDoc-only comments (src/features|shared|cli, allow eslint,global; --fix/--dry-run pass|clean|rejected)
npm run check              # types + lint + format:check + test + check:comments (CI)
npm run build              # bundle CLI to dist/cli.js (required for npm publish / npx)
npm run sync:agents        # regenerate GENERATED baseline + tooling in agents from CODING_GUIDELINES.md
npm run sync:agents:check  # verify agents are in sync (CI)
npm run sync:artifacts     # sync CODING_GUIDELINES.md + validators to root/.swarmroom (check with sync:artifacts:check)
npm run sync:skills        # regenerate skills/ mirror for skills.sh
npm run sync:skills:check  # verify skills/ mirror is in sync (CI)
npm run setup              # node src/cli.ts (run the installer; alias)
node src/assets/artifacts/validate-spec.mjs --file .swarmroom/specs/<slug>.md  # deterministic spec gate: slug, headings order, frontmatter, Given/When/Then
node src/cli.ts --cursor --opencode --codex --global --force   # non-interactive install
node src/cli.ts tasks --tasks-file <path>.tasks [validate|ready|set <id> <status>|replan --file <path>] [--dir <path>]  # tasksFile MUST end with .tasks; validate ALWAYS before ready|set|replan
```

Local development runs TypeScript directly under Node ≥ 23.6 (native type
stripping). The published package ships `dist/cli.js` because Node refuses to
strip types under `node_modules` — that is what `npx` executes. Runtime of the
published bin needs Node ≥ 20.

## How it wires together

- `src/shared/kernel/pipeline.ts` — single source of truth declaring the `sw-*` agent
  names and the `skills` list. Adding an agent/skill requires updating this **and**
  dropping the matching file in `src/assets/`; targets are then handled automatically.
- `src/shared/kernel/tasks-format.ts` — shared `.tasks` block parsing (LINE_RE, splitList, parseBlockRecord, CANONICAL_ORDER) in English.
- `src/shared/kernel/findings-validator.ts` — deterministic validator for `FINDING N | Severity | file:line | rule | description` (strict vocab, sequential N, `No findings` case).
- `src/shared/kernel/style.ts` — picocolors helpers for file/task status (no outward deps).
- `src/shared/kernel/package-root.ts` — walk up to `package.json` for assets resolution.
- `src/features/tasks/tasks.ts` / `scheduler.ts` — pure Task Graph + ready/parallel selection (no IO).
- `src/features/tasks/task-store.ts` — read/write `.swarmroom/tasks/<runId>.tasks` (blocks `field: value`, no JSON, English errors) in a consumer project (isolated per pipeline, `--tasks-file` required).
- `src/assets/artifacts/check-comments.mjs` — deterministic JSDoc-only gate with `--fix/--dry-run` (`pass|clean|rejected`), `PATTERNS` const, `isViolation` deduplication; `findings-validator.mjs` — findings schema validator; `validate-spec.mjs` — spec gate (slug, headings order, frontmatter, `Given/When/Then`, trailing `\n`).
- `scripts/sync-agents.mjs` — injects GENERATED baseline + tooling into `src/assets/agents/*.md` from `CODING_GUIDELINES.md` (tested by `src/assets/agents/sync-agents.test.ts`); `scripts/sync-artifacts.mjs` — mirrors validators + guidelines to root/.swarmroom; `scripts/sync-skills.mjs` — mirrors standalone skills to `skills/`.
- `src/features/tasks-cli/tasks.ts` — adapter for `tasks` CLI commands (render, replan discrimination, humanReady).
- `src/features/installer/targets.ts` — per-editor `Target` configs (cursor|opencode|claude|codex)
  with directory layouts and frontmatter rewrites. New editor = add a `Target` here.
  A Target can split agent vs skill roots (`skillsRoot` / `skillsGlobalBase`) and
  set `agentExt`.
- `src/features/installer/installer.ts` — idempotent copy of assets to target roots:
  skips existing files unless `overwrite`/`--force`; fails fast if any asset is missing.
- `src/features/installer/report.ts` / `prompts.ts` — CLI reporting (displayPath, status counts) and interactive selection.
- Agent/skill files in `src/assets/` carry Cursor-specific frontmatter
  (`readonly:`, `model:`, `argument-hint:`); the installer strips/rewrites it to
  `mode: subagent` for opencode/Claude, and to TOML (`name`, `description`,
  `developer_instructions`) for Codex. Keep Cursor-only lines in the assets.
- `src/cli.ts` — orchestrator (install vs tasks); `src/cli/args.ts` — argv parsing (no framework, stdlib readline for prompts).

## TypeScript quirks (strict)

- `verbatimModuleSyntax` is on: type-only imports MUST use `import type { ... }`.
- Imports use the `.ts` extension (e.g. `from './targets.ts'`) — Node ESM + `allowImportingTsExtensions`.
- `strict` + `noUncheckedIndexedAccess` are on: array/object indexing yields `T | undefined`.
- Lint/format gates are strict: `npm run lint` (eslint + unicorn), `npm run format:check` (prettier), `npm run check:comments` (JSDoc-only). CI runs `npm run check`.

## Style / workflow

- Follow `src/assets/artifacts/CODING_GUIDELINES.md` (guard clauses, explicit
  errors, small focused pure units, no premature abstraction). If it changes,
  run `npm run sync:agents` to regenerate GENERATED blocks and `npm run sync:artifacts` to sync the gitignored root `CODING_GUIDELINES.md` and `.swarmroom/artifacts/*.mjs` (or let the installer do it).
- Specs are generated in `.swarmroom/specs/<slug>.md` (English, isolated from `docs/`), not `docs/specs/`. Only `.swarmroom/specs/<slug>.md` is writable by `sw-spec`; validate with `node src/assets/artifacts/validate-spec.mjs --file <path>` (English headings in exact order, no frontmatter, non-empty sections, `Given/When/Then` in Acceptance Criteria, slug `[a-z0-9-]` ≤60).
- Tests are colocated `*.test.ts` next to their modules, using `node:test`.
- Comments are JSDoc-only (`/** */`): `npm run check:comments` fails on `//` outside allowlist (`eslint,global`). See `src/assets/artifacts/check-comments.mjs` (and GENERATED Deterministic tooling in agents).
