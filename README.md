# swarmroom

Portable `sw-*` coding agents (planner, implementer, code-reviewer, verifier,
fixer, researcher) plus the `sw-pipeline` skill that orchestrates them. One
source of truth in `src/assets`, installed into Cursor, opencode, or Claude
Code with a small TypeScript CLI.

## What it is

Each `sw-*` agent encodes the same baseline principles — guard clauses, fail
fast, SRP, DRY, KISS, clear names, no magic strings, validate once — and defers
to a repo's own `AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when
present, so they work in any project without locking you into one tool.

## Install

From inside the project (or clone first):

```
git clone https://github.com/RMRdeveloper/swarmroom
cd swarmroom
node src/cli.ts               # interactive: pick editors + scope
```

Non-interactive (productions/CI):

```
node src/cli.ts --cursor --opencode --global --force
```

| Option       | Effect                                             |
| ------------ | -------------------------------------------------- |
| `--cursor`   | install into Cursor                                |
| `--opencode` | install into opencode                              |
| `--claude`   | install into Claude Code                           |
| `--global`   | install into the homedir (default: this project)   |
| `--dir`      | install into another project root                  |
| `--force`    | overwrite existing files without asking            |
| `--help`     | show usage                                         |

## Update

Re-run the same command. Existing files are skipped unless you pass `--force`
or confirm overwrite in the interactive prompt:

```
node src/cli.ts --force
```

## What gets installed

| Editor    | Agents                     | Orchestrator skill                     |
| --------- | -------------------------- | -------------------------------------- |
| Cursor    | `.cursor/agents/*.md`      | `.cursor/skills/sw-pipeline/SKILL.md`  |
| opencode  | `.opencode/agent/*.md`     | `.opencode/skill/sw-pipeline/SKILL.md` |
| Claude    | `.claude/agents/*.md`      | `.claude/skills/sw-pipeline/SKILL.md`  |

Each editor gets the same agents; the installer rewrites the heading
frontmatter (`readonly` vs `mode: subagent`) so the files are valid for the
target.

## Pipeline

```
sw-pipeline → sw-planner → sw-implementer → sw-code-reviewer / sw-verifier → sw-fixer
```

`sw-pipeline` runs the stages end to end, each delegating to its subagent. If a
stage reports Critical findings it doesn't advance: it loops
implementer→fixer until clean.

## Agents

| Agent          | Read-only | How uses                                             |
| -------------- | --------- | ---------------------------------------------------- |
| `sw-planner`       | yes       | Plan any non-trivial change before editing            |
| `sw-implementer`   | no        | Writes/modicates code per standards, runs lint+tests  |
| `sw-code-reviewer` | yes       | Reviews diffs strictly, one `FINDING` line per issue   |
| `sw-verifier`      | yes       | Confirms it exists, is wired, passes tests            |
| `sw-fixer`         | no    | Fixes findings severity-first, max 2 passes per finding |
| `sw-researcher`    | yes       | Answers codebase questions with cited evidence          |

## Findings contract

`sw-code-reviewer` and `sw-verifier` emit, and `sw-fixer` consumes, one line
per finding:

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
│   ├── pipeline.ts   # single source of the sw-* agent names + skill name
│   └── targets.ts    # Target configs (cursor|opencode|claude) + frontmatter rewrites
├── io/
│   └── installer.ts  # copies assets to the target dir (idempotent)
├── cli/
│   └── prompts.ts    # interactive selection (stdlib readline)
└── assets/           # the markdown you install (source of truth)
    ├── skills/sw-pipeline/SKILL.md
    └── agents/sw-*.md
```

## Development

```
npm install
npm run types    # tsc --noEmit type check
npm run setup    # run the CLI (alias for `node src/cli.ts`)
```

TypeScript runs directly (Node's native type stripping, erg requires Node
≥ 23.6); there is no build step.

## Adding a tool or agent

- New editor target: add one `Target` entry in `src/domain/targets.ts` — the
  rest is specific.
- New agent: add its markdown to `src/assets/agents/` and its name to
  `src/domain/pipeline.ts`.

## License

[MIT](LICENSE)