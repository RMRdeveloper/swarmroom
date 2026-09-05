# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.0] - 2026-09-04

### Added

- **Pi installer target (`--pi`):** `installPi`/`piPresent` in `src/features/installer/installer.ts` install the `/sw-pipeline` extension (`.pi/extensions/sw-pipeline.ts`) plus the session-driver skill (`.pi/skills/sw-pipeline/SKILL.md`) for project (`.pi`) or global (`~/.pi/agent`) scope, with homedir safety, overwrite confirm, dry-run, and report support (`printPiReport`, closing label).
- **Orchestrated session-driven pipeline:** single-step core (`src/swarm/steps.ts`: `PersistedRun`, `nextAction`, `advanceRun`) with persisted runs (`.swarmroom/runs/<id>.swarm.json` via `src/swarm/run-store.ts`); `swarmroom swarm start/step/status` CLI; `sw-pipeline` skill rewritten as conversational driver (triage, grilling, plan approval, step loop with write approval); Pi `/sw-pipeline` extension launches in-chat via `sendUserMessage` (TypeScript keeps all routing; no background spawn).

## [Unreleased]

### Added

- **Deterministic pipeline (sw-pipeline):** trivial iff ALL `(a) ≤20 lines, (b) exactly 1 file, (c) no new dep/import, (d) no design decision, (e) user confirms via`ask_user_question`(Pi/opencode/Claude)` — else non-trivial via `sw-grilling`; guard “if doubt, ask”. `tasksFile` MUST end with `.tasks` (`assertTasksFileSafe` + `/\.tasks$/` in `src/shared/kernel/tasks-format.ts` / `src/features/tasks/task-store.ts`); `validate` ALWAYS before `ready|set|replan` and after graph changes (abort if not `Valid task graph: N tasks.`). Scheduling deterministic via `selectRunnable()` in `src/features/tasks/scheduler.ts` (no re-implementation of disjoint check); token budget via `humanReady()` + task result only.
- **Deterministic spec (sw-spec):** `src/assets/artifacts/validate-spec.mjs` — validates slug `[a-z0-9-]` ≤60, English headings exactly `Context / Goal / Non-goals / Requirements / Acceptance Criteria / Constraints / Open Questions` in order, no frontmatter `---`, must end with `\n`, non-empty sections, `Given/When/Then` in Acceptance Criteria. Project-root resolution via `packageRoot()` semantics; ambiguous root asks via harness question tool; `existsSync` guard + `ask_user_question` (Overwrite / Pick new slug); ONLY writable path `.swarmroom/specs/<slug>.md` (forbidden `src/**`, `docs/**`, `.swarmroom/tasks/**`, `.swarmroom/artifacts/**`); `ARTIFACTS_ALLOWLIST` now includes `validate-spec.mjs`.
- **Deterministic transcribe (sw-transcribe-audio):** path resolution via `assetsDir()`/`packageRoot()` semantics (never assume cwd); guardrails for quoted paths with spaces, `~25MB/30min` recommendation, `large-v3-turbo` 809 MB OOM note, stdout validation via `python -m json.tool` (`{"language","text"}`); missing `ffmpeg`/`uv` asks via `ask_user_question` (Install now / Abort) and never auto-installs.
- **Generated agents baseline:** `scripts/sync-agents.mjs` injects GENERATED baseline (verbatim `CODING_GUIDELINES.md` quick-reference table) + Deterministic tooling blocks into `src/assets/agents/*.md` (tested by `src/assets/agents/sync-agents.test.ts`); CI runs `npm run sync:agents:check` (`package.json` adds `sync:agents` / `sync:agents:check`, `sync:artifacts` / `sync:artifacts:check`).
- **Grilling Pi mapping:** `sw-grilling` now documents harness question tools explicitly — Pi `ask_user_question` (`header` ≤16, `question` ends with `?`, 2–4 options `{label, description}`, `(Recommended)` first), opencode `question`, Claude `AskUserQuestion`, Cursor `AskQuestion`, Codex `request_user_input`; `< =3` questions per round, skip-first + leverage fill, continuous numbering.
- **Critic ownership:** `sw-critic` now owns ONLY logical/architecture/YAGNI (concrete counterexample, assumption vs `CONTEXT.md`/`AGENTS.md`, dependency direction/Law of Demeter/CQS/validate-once, over/under-engineering) and explicitly forbids duplicating `sw-code-reviewer`/`sw-verifier` style (guard/SRP/DRY/naming/Comments) — baseline is reference-only.

### Changed

- `README.md` / `AGENTS.md`: Source of truth now lists `validate-spec.mjs`, `findings-validator.mjs`/`check-comments.mjs`, `scripts/sync-agents.mjs` + `sync-agents.test.ts`, `skills/` mirror note via `sync-skills.mjs`, 4-editor install matrix (Cursor/opencode/Claude/Codex frontmatter rewrites), root `CODING_GUIDELINES.md` as gitignored copy via `sync:artifacts`, and deterministic invariants (`tasksFile` MUST `.tasks`, trivial iff ALL, `validate` ALWAYS, ONLY writable `.swarmroom/specs`, GENERATED Deterministic tooling). Commands now include `sync:agents`, `sync:agents:check`, `sync:artifacts`, `sync:skills:check`, `validate-spec` usage and `check:comments --fix` semantics.
- `.github/workflows/ci.yml`: now runs `sync:artifacts:check`, `sync:agents:check`, `sync:skills:check` on both Node 20/24 matrix; `src/features/tasks-cli`, `scheduler`, `tasks-format` centralized validation (`assertTasksFileSafe`, `LINE_RE`, `CANONICAL_ORDER`).

## [2.4.0] - 2026-08-28

### Added

- **i18n English:** All `.tasks` block errors translated from Spanish to English (`block N line L: malformed line`, `unknown key`, `duplicate key`, `missing field`, `invalid status`, `cannot be empty`, `contains empty element`, `cannot mix "-"`, `must be a non-empty string`, `must be integer >=0`, `legacy JSON format not supported`); `sw-spec` now `Always write in English` (was `language of the user's request`).
- **Task graph fixes:** `propagateFailure` fail-closed via `completed` (transitive), `readyTasks`/`isComplete` with implicit `propagateFailure` to avoid deadlock, `detectCycle` fail-fast on missing dep, `WRITER_SET` strong typing (`typeof WRITER_AGENTS[number]`), `taskGraphPath` validates `..`/`\\0` also for absolute paths.
- **Deterministic comment gate:** `src/assets/artifacts/check-comments.mjs` refactored to `PATTERNS` const, `isViolation`/`collectViolationsFromLines` deduplication, `TODO` word-boundary + comment-only, `eslint-disable` requires `-- reason`, new `--fix`/`--dry-run` (`pass|clean|rejected`) and sync to `.swarmroom/artifacts/`.
- **Findings validator:** New `src/shared/kernel/findings-validator.ts` + `src/assets/artifacts/findings-validator.mjs` + CLI `swarmroom validate-findings --file <path> [--strict]` validates `FINDING N | Severity | file:line | rule | description` (strict vocab, `file:line` existence, sequential N, no `|` in description, `No findings` special case).
- **Specs isolation:** `sw-spec` now stores specs in `.swarmroom/specs/<slug>.md` (was `docs/specs/`), isolating swarmroom-generated specs from real project `docs/`.
- **Pipeline determinism (2+1):** `sw-implementer`/`sw-fixer` self-check via `.swarmroom/artifacts/check-comments.mjs --staged`; orchestrator runs single deterministic `check-comments --staged` after `T2` and injects `FINDING` to `sw-code-reviewer`/`sw-verifier` (who no longer re-run the script).

### Changed

- `README.md`: `sw-spec` row and `What you get`/`Repository layout` now document `.swarmroom/specs/` and `findings-validator.mjs`.
- `src/assets/agents/{sw-code-reviewer,sw-verifier}.md` now consume orchestrator-provided `FINDING` instead of re-running `check-comments` (DRY).
- `src/features/installer/installer.ts` `ARTIFACTS_ALLOWLIST` now `["check-comments.mjs", "findings-validator.mjs"]`.

## [2.3.1] - 2026-08-27

### Fixed

- **Docs:** `README.md` repository layout now reflects `src/shared/kernel/` + `src/features/{installer,tasks,tasks-cli}/` and `src/cli/args.ts` (previously showed removed `src/domain/` / `src/io/` / `src/cli/{report,prompts,style}.ts`); development commands now list `npm run lint` / `format:check` / `check:comments` / `check` (CI) and artifact install note documents `.swarmroom/artifacts/check-comments.mjs` (`ARTIFACTS_ALLOWLIST`); adding-a-target/agent paths corrected to `src/features/installer/targets.ts` and `src/shared/kernel/pipeline.ts`.
- **Docs:** `AGENTS.md` TypeScript quirks no longer claims "No lint step" — now documents strict `lint` / `format:check` / `check:comments` gates and `npm run check` in CI; commands section updated to full `types + lint + format:check + test + check:comments` list; style workflow now mentions `check-comments.mjs` artifact sync and JSDoc-only rule.
- `src/assets/agents/sw-planner.md` example path `src/domain/types.ts` → `src/features/auth/types.ts`.

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

[Unreleased]: https://github.com/RMRdeveloper/sideroom-pi/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/RMRdeveloper/sideroom-pi/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/RMRdeveloper/sideroom-pi/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/RMRdeveloper/sideroom-pi/releases/tag/v2.2.0
