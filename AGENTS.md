# AGENTS.md

This repo is the installer + source-of-truth for the portable `sw-*` coding
agents (planner, implementer, code-reviewer, verifier, fixer, researcher) and the
`sw-pipeline` + `grilling` skills, installed into Cursor, opencode, or Claude Code.

## Source of truth (critical)

- The **only** tracked source of agent/skill content is `src/assets/`:
  - `src/assets/agents/*.md`
  - `src/assets/skills/<name>/SKILL.md`
  - `src/assets/artifacts/CODING_GUIDELINES.md`
- `.cursor/`, `.claude/`, `.opencode/`, and the repo-root `CODING_GUIDELINES.md`
  are **gitignored installed copies** produced by the CLI. Do NOT edit them; a
  re-run of the installer overwrites them. Editing `src/assets/...` is the only
  change that matters.

## Commands

```
npm install
npm run types        # tsc --noEmit (type check)
npm test             # node --test 'src/**/*.test.ts'
npm run setup        # node src/cli.ts (run the installer; alias)
node src/cli.ts --cursor --opencode --global --force   # non-interactive install
```

No build step: TypeScript runs directly under Node ≥ 23.6 (native type
stripping). Requires Node ≥ 23.6.

## How it wires together

- `src/domain/pipeline.ts` — single source of truth declaring the `sw-*` agent
  names and the `skills` list. Adding an agent/skill requires updating this **and**
  dropping the matching file in `src/assets/`; targets are then handled automatically.
- `src/domain/targets.ts` — per-editor `Target` configs (cursor|opencode|claude)
  with directory layouts and frontmatter rewrites. New editor = add a `Target` here.
- `src/io/installer.ts` — idempotent copy of assets to target roots:
  skips existing files unless `overwrite`/`--force`; fails fast if any asset is missing.
- Agent/skill files in `src/assets/` carry Cursor-specific frontmatter
  (`readonly:`, `model:`, `argument-hint:`); the installer strips/rewrites it to
  `mode: subagent` for opencode/Claude. Keep Cursor-only lines in the assets.
- `src/cli.ts` — argv parsing (no framework, stdlib readline for prompts), orchestrates install.

## TypeScript quirks (strict)

- `verbatimModuleSyntax` is on: type-only imports MUST use `import type { ... }`.
- Imports use the `.ts` extension (e.g. `from './targets.ts'`) — Node ESM + `allowImportingTsExtensions`.
- `strict` + `noUncheckedIndexedAccess` are on: array/object indexing yields `T | undefined`.
- No lint step — only `npm run types` and `npm test`.

## Style / workflow

- Follow `src/assets/artifacts/CODING_GUIDELINES.md` (guard clauses, explicit
  errors, small focused pure units, no premature abstraction). If it changes,
  re-run the installer to sync the gitignored root copy.
- Tests are colocated `*.test.ts` next to their modules, using `node:test`.