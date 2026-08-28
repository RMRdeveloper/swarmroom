# AGENTS.md

This repo is the installer + source-of-truth for the portable `sw-*` coding
agents (planner, implementer, code-reviewer, verifier, fixer, researcher, web-researcher) and the
`sw-pipeline`, `sw-spec`, `sw-grilling`, `sw-critic`, and `sw-transcribe-audio` skills, installed into Cursor, opencode, Claude Code, or Codex.

## Source of truth (critical)

- The **only** tracked source of agent/skill content is `src/assets/`:
  - `src/assets/agents/*.md`
  - `src/assets/skills/<name>/` (`SKILL.md` plus optional companion files the installer copies as-is)
  - `src/assets/artifacts/CODING_GUIDELINES.md`
- `skills/` is a **generated, spec-compliant mirror** for `skills.sh` (`npx skills add` discovers `skills/*/SKILL.md`). It contains **only standalone skills** (`sw-grilling`, `sw-spec`, `sw-critic`, `sw-transcribe-audio`); `sw-pipeline` (orchestrator, delegates to 7 subagents) is excluded because `skills.sh` cannot install agents. Do NOT edit `skills/` by hand; run `npm run sync:skills` (and `npm run sync:skills:check` in CI) — it is derived from `src/assets/skills/`.
- `.cursor/`, `.claude/`, `.opencode/`, `.codex/`, `.agents/`, and the repo-root
  `CODING_GUIDELINES.md` are **gitignored installed copies** produced by the CLI.
  Do NOT edit them; a re-run of the installer overwrites them. Editing
  `src/assets/...` is the only change that matters.

## Commands

```
npm install
npm run types            # tsc --noEmit (type check)
npm run lint             # eslint . (strict + unicorn)
npm run format:check     # prettier --check .
npm test                 # node --test 'src/**/*.test.ts'
npm run check:comments   # deterministic gate: JSDoc-only comments (src/features|shared|cli)
npm run check            # types + lint + format:check + test + check:comments (CI)
npm run build            # bundle CLI to dist/cli.js (required for npm publish / npx)
npm run sync:skills      # regenerate skills/ mirror for skills.sh
npm run setup            # node src/cli.ts (run the installer; alias)
node src/cli.ts --cursor --opencode --codex --global --force   # non-interactive install
node src/cli.ts tasks --tasks-file <path> [validate|ready|set <id> <status>|replan --file <path>] [--dir <path>]
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
- `src/assets/artifacts/check-comments.mjs` — deterministic JSDoc-only gate with `--fix/--dry-run` (`pass|clean|rejected`), `PATTERNS` const, `isViolation` deduplication; `findings-validator.mjs` — findings schema validator.
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
  re-run the installer to sync the gitignored root copy and `src/assets/artifacts/*.mjs` to `.swarmroom/artifacts/`.
- Specs are generated in `.swarmroom/specs/<slug>.md` (English, isolated from `docs/`), not `docs/specs/`.
- Tests are colocated `*.test.ts` next to their modules, using `node:test`.
- Comments are JSDoc-only (`/** */`): `npm run check:comments` fails on `//` outside allowlist (`eslint,global`). See `src/assets/artifacts/check-comments.mjs`.
