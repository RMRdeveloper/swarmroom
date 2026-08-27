# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.0] - 2026-08-27

### Added

- **Feature-based reorg:** `src/shared/kernel/{pipeline,tasks-format,style,package-root}.ts` extracts shared kernel; `src/features/tasks/{tasks,scheduler,task-store}.ts`, `src/features/tasks-cli/tasks.ts`, `src/features/installer/{targets,installer,report,prompts}.ts` isolate feature verticals with shims removed; `AGENTS.md` wiring updated.
- **Comment hygiene:** `CODING_GUIDELINES.md` now enforced via deterministic gate `scripts/check-comments.mjs` + artifact `src/assets/artifacts/check-comments.mjs` (builtin-only, 0 deps, JSDoc-only `/** */`, allowlist `eslint,global`, `TODO` without `#123` fails, parser hunk for `git diff -U0 --staged`). Wired to `.husky/pre-commit` and `npm run check:comments` / `npm run check`.
- **Artifact install:** `src/features/installer/installer.ts` `installArtifacts` / `artifactsPresent` whitelist `['check-comments.mjs']` copies `src/assets/artifacts/check-comments.mjs` to `.swarmroom/artifacts/check-comments.mjs` (project scope, `overwrite` flag, fail-fast, gitignored like tasks); `src/cli.ts:93` wires project-scope install with `printArtifactReport`.
- `src/assets/agents/{sw-code-reviewer,sw-verifier,sw-fixer,sw-implementer}.md` — checklist hygiene outside Baseline (JSDoc-only, aggregated `FINDING 1 | Medium | file:line, … | Comments`, `sw-fixer` auto-converts `//` → `/** */` in 1 pass).
- `src/cli/args.ts` now imports `src/features/*` / `src/shared/kernel/*` (no `src/domain`/`src/io`).

### Changed

- `src/cli/args.ts` tests and `src/assets/{agents,skills}.test.ts` import `src/shared/kernel/pipeline` / `src/features/installer/targets`.
- Empty `src/domain/` and `src/io/` removed; `src/cli/{tasks,report,prompts,style}.ts` removed (shims deleted after migration).
- `eslint.config.js` — override for `src/assets/artifacts/**/*.mjs` + `scripts/check-comments.mjs` (disableTypeChecked + unicorn parity), `.swarmroom` kept ignored.
- `package.json:9` still `["dist","src/assets","skills"]` (scripts not published via `files` before; now artifact is `src/assets/artifacts/check-comments.mjs` and is published, agnostic 0 deps).
- Direct `//` line-comment hygiene enforced; remaining `/** JSDoc */` for non-obvious intent only.

### Fixed

- `.swarmroom/artifacts` sync staleness and empty `catch { diff='' }` swallowing `git diff` failures now `throw new Error(...,{cause})`.

## [2.2.0] - 2026-08-26

### Breaking

- **Task graph storage migrates from JSON to blocks `field: value` + `.tasks` extension.** No JSON fallback. Any existing `.swarmroom/tasks/<runId>.json` file must be migrated to `.swarmroom/tasks/<runId>.tasks` (blocks `field: value`, blank line between blocks, file ends with `\n`) before use.
- **File extension `.json` → `.tasks`.** `tasksFile` must now end in `.tasks` (e.g. `<runId>.tasks` stored as `.swarmroom/tasks/<runId>.tasks`). Legacy `.json` paths are rejected.
- **`--json` flag removed.** `swarmroom tasks --tasks-file <path> [--json]` / `node src/cli.ts tasks --tasks-file <path> [--json]` now fails with `unknown option: --json`. Use the default blocks output; there is no JSON output mode.
- **`parseTaskGraph` and `readProposal` reject legacy JSON.** Input starting with `{` or `[` throws `formato JSON legacy no soportado — se esperaba .tasks en bloques campo: valor` / `formato JSON legacy no soportado en propuesta — se esperaba bloques campo: valor`. No silent fallback.

### Changed

- `src/io/task-store.ts` — rewritten to parse/serialize blocks `field: value` (`LINE_RE = ^([A-Za-z]+): (.*)$`, `CANONICAL_ORDER: id, status, dependsOn, agent, title, description, files, acceptance, result, error, attempts`, `"-"` sentinel for empty, `createGraph` validates duplicates/cycles/missing deps, BOM/CRLF normalization).
- `src/cli/tasks.ts` — `readProposal` rewritten to parse blocks replan proposals (`addTasks` / `addDependencies` as blocks; dependency block is exactly `id` + `dependsOn` single id); JSON proposals rejected.
- `src/cli/args.ts` — `parseTasksArgs` no longer accepts `--json`; unknown flags fail fast with `unknown option`.
- `src/cli.ts` — tasks dispatch updated for blocks format.
- `src/assets/agents/sw-planner.md` — **Task Graph shape** now documents blocks `field: value` format, fields table, line regex, blank-line separation, `"-"` sentinel, canonical order, example 3-task graph, and `Legacy JSON format no longer supported`.
- `src/assets/skills/sw-pipeline/SKILL.md` — updated triage, **Task graph — isolated per run (breaking change)**, block format description, `--tasks-file` usage (`<runId>.tasks`), and replanning (`addTasks`/`addDependencies` blocks).
- `AGENTS.md` — `src/io/task-store.ts` line now reads `read/write .swarmroom/tasks/<runId>.tasks (blocks field: value, no JSON)` and CLI example drops `[--json]`.
- `README.md` — parallel-pipeline, help, and isolation examples now reference `.swarmroom/tasks/<runId>.tasks` (blocks `field: value`, no JSON) and `--tasks-file <runId>.tasks`; removed `--json` note.

### Added

- Blocks validation with precise errors: `bloque N línea L: línea malformada`, `clave desconocida`, `clave duplicada`, `falta campo`, `status inválido`, `dependsOn`/`files`/`acceptance` empty/mixing `"-"` checks, `attempts` integer `>=0`.
- `package.json` `files` verified as `["dist", "src/assets", "skills"]` — published artifact includes bundled CLI, source assets, and `skills.sh` mirror only.

### Migration notes

1. Rename every task graph: `mv .swarmroom/tasks/<runId>.json .swarmroom/tasks/<runId>.tasks` and convert content from JSON to blocks (one `field: value` line per field, blank line between tasks, `dependsOn: -` when empty, `files` comma-separated, `acceptance` semicolon-separated).
2. Update all invocations: replace `--tasks-file <runId>.json` with `--tasks-file <runId>.tasks` and never pass `--json` (now an error).
3. Update any custom `readProposal` callers: proposal files must also be blocks, not JSON `{ addTasks, addDependencies }`.
4. Run `npx --yes @rmrdeveloper/swarmroom tasks --tasks-file <runId>.tasks validate` to verify migrated graphs; fix reported `bloque N …` errors.

### Files changed

- `CHANGELOG.md` (new)
- `AGENTS.md`
- `README.md`
- `src/assets/agents/sw-planner.md`
- `src/assets/skills/sw-pipeline/SKILL.md`
- `package.json` (verified `files: [dist, src/assets, skills]`)
- `src/io/task-store.ts`
- `src/io/task-store.test.ts` (+ `src/io/task-store.fuzz.test.ts`)
- `src/cli/tasks.ts`
- `src/cli/tasks.test.ts`
- `src/cli/args.ts`
- `src/cli/args.test.ts`
- `src/cli.ts`
- `src/cli.test.ts`

[Unreleased]: https://github.com/RMRdeveloper/swarmroom/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/RMRdeveloper/swarmroom/releases/tag/v2.2.0
