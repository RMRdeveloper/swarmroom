# swarmroom

Portable `sw-*` coding agents (planner, implementer, code-reviewer, verifier,
fixer, researcher, web-researcher) plus the `sw-pipeline` skill that orchestrates them. One
source of truth in `src/assets`, installed into Cursor, opencode, or Claude
Code with a small TypeScript CLI.

## What it is

Each pipeline `sw-*` agent carries the full quick-reference baseline from
`CODING_GUIDELINES.md` (one line per Do cell) and defers to a repo's own
`AGENTS.md` / `CODING_GUIDELINES.md` / `CONTEXT.md` when present, so they work
in any project without locking you into one tool.

## Install

```
npx @rmrdeveloper/swarmroom               # interactive: pick editors + scope
npx @rmrdeveloper/swarmroom --cursor --opencode --global --force
```

Or install the CLI globally and run `swarmroom`:

```
npm install -g @rmrdeveloper/swarmroom
swarmroom --claude --dir /path/to/project
```

From a clone (development):

```
git clone https://github.com/RMRdeveloper/swarmroom
cd swarmroom
node src/cli.ts
```

| Option       | Effect                                             |
| ------------ | -------------------------------------------------- |
| `--cursor`   | install into Cursor                                |
| `--opencode` | install into opencode                              |
| `--claude`   | install into Claude Code                           |
| `--global`   | install into the homedir (default: this project)   |
| `--dir`      | install into another project root                  |
| `--force`    | overwrite existing files without asking            |
| `--verbose` / `-v` | list each installed file                     |
| `--quiet` / `-q` | suppress per-target summaries (opening/closing still print) |
| `--help` / `-h` | show usage                                      |
| `--version` / `-V` | print version                                |

`--verbose` and `--quiet` are mutually exclusive.

## Update

Re-run the same command. Existing files are skipped unless you pass `--force`
or confirm overwrite in the interactive prompt:

```
node src/cli.ts --force
```

## What gets installed

| Editor    | Agents                     | Skills                                                      |
| --------- | -------------------------- | ----------------------------------------------------------- |
| Cursor    | `.cursor/agents/*.md`      | `.cursor/skills/{sw-pipeline,grilling}/SKILL.md`            |
| opencode  | `.opencode/agent/*.md`     | `.opencode/skill/{sw-pipeline,grilling}/SKILL.md`           |
| Claude    | `.claude/agents/*.md`      | `.claude/skills/{sw-pipeline,grilling}/SKILL.md`            |

Each editor gets the same agents; the installer rewrites the heading
frontmatter (`readonly` vs `mode: subagent`) so the files are valid for the
target. Both `sw-pipeline` and `grilling` are installed into the editor
skills directory.

Project-scope installs also copy `CODING_GUIDELINES.md` once to the project
root (the cwd or `--dir` path). Global installs skip that file.

## Pipeline

```
sw-pipeline → sw-planner → sw-implementer → sw-code-reviewer / sw-verifier → sw-fixer
```

`sw-pipeline` runs the stages end to end, each delegating to its subagent. For
non-trivial work, only `sw-planner` runs `grilling` to settle decisions before
planning. If a stage reports Critical findings it doesn't advance: it loops
implementer→fixer until clean.

`sw-researcher` and `sw-web-researcher` are deliberately outside the pipeline:
on-demand research oracles for evidence-backed answers (codebase vs web/docs),
not stages in the orchestrated flow.

## Agents

| Agent          | Read-only | How it uses                                          |
| -------------- | --------- | ---------------------------------------------------- |
| `sw-planner`       | yes       | Plan any non-trivial change before editing            |
| `sw-implementer`   | no        | Writes/modifies code per standards, runs lint+tests  |
| `sw-code-reviewer` | yes       | Reviews diffs strictly, one `FINDING` line per issue   |
| `sw-verifier`      | yes       | Confirms it exists, is wired, passes tests            |
| `sw-fixer`         | no    | Fixes findings severity-first, max 2 passes per finding |
| `sw-researcher`    | yes       | Answers codebase questions with cited evidence          |
| `sw-web-researcher` | yes     | Answers web/docs questions with cited URLs              |

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
│   ├── pipeline.ts   # single source of the sw-* agent names + skills list
│   └── targets.ts    # Target configs (cursor|opencode|claude) + frontmatter rewrites
├── io/
│   └── installer.ts  # copies assets to the target dir (idempotent)
├── cli/
│   ├── args.ts       # argv parsing + help text
│   ├── report.ts     # install summary output
│   ├── style.ts      # TTY-aware colors (picocolors)
│   └── prompts.ts    # interactive selection (stdlib readline)
└── assets/           # the markdown you install (source of truth)
    ├── artifacts/CODING_GUIDELINES.md
    ├── skills/sw-pipeline/SKILL.md
    ├── skills/grilling/SKILL.md
    └── agents/sw-*.md
```

## Development

```
npm install
npm run types    # tsc --noEmit type check
npm test         # node:test suite
npm run build    # bundle CLI → dist/cli.js (what npm/npx ships)
npm run setup    # run the CLI from source (alias for `node src/cli.ts`)
```

Runtime dependency: `picocolors` (TTY / `NO_COLOR` aware terminal colors).

Local development runs TypeScript directly (Node ≥ 23.6 native type stripping).
The published package ships a bundled `dist/cli.js` — Node does not strip types
under `node_modules`, so `npx` cannot execute `.ts` entrypoints. Published
runtime requires Node ≥ 20.

## Adding a tool or agent

- New editor target: add one `Target` entry in `src/domain/targets.ts` — the
  rest is automatic.
- New agent: add its markdown to `src/assets/agents/` and its name to
  `src/domain/pipeline.ts`.
- New skill: add `src/assets/skills/<name>/SKILL.md` and append the name to
  `skills` in `src/domain/pipeline.ts`.

## License

[MIT](LICENSE)
