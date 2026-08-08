# swarmroom

[![CI](https://img.shields.io/github/actions/workflow/status/RMRdeveloper/swarmroom/ci.yml?branch=main)](https://github.com/RMRdeveloper/swarmroom/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@rmrdeveloper/swarmroom)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![node](https://img.shields.io/node/v/@rmrdeveloper/swarmroom)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![license](https://img.shields.io/github/license/RMRdeveloper/swarmroom)](LICENSE)

Install the same `sw-*` coding agents into **Cursor**, **opencode**, **Claude Code**, or **Codex**. One source of truth; each editor gets files it can load.

## Install

```
npx @rmrdeveloper/swarmroom
```

Pick editors and whether to install in this project or your home directory. Non-interactive:

```
npx @rmrdeveloper/swarmroom --cursor --opencode --claude --codex --force
npx @rmrdeveloper/swarmroom --global --codex --force
```

Or `npm i -g @rmrdeveloper/swarmroom`, then `swarmroom`. Re-run the same command to update. Existing files are skipped unless you pass `--force`.

`swarmroom --help` lists flags. `swarmroom tasks` prints `.swarmroom/tasks.json` status (`--json` for the raw graph). It does not run agents.

## What you get

| Editor | Agents | Skills |
| --- | --- | --- |
| Cursor | `.cursor/agents/*.md` | `.cursor/skills/{sw-pipeline,grilling}/SKILL.md` |
| opencode | `.opencode/agent/*.md` | `.opencode/skill/{sw-pipeline,grilling}/SKILL.md` |
| Claude Code | `.claude/agents/*.md` | `.claude/skills/{sw-pipeline,grilling}/SKILL.md` |
| Codex | `.codex/agents/*.toml` | `.agents/skills/{sw-pipeline,grilling}/SKILL.md` |

Project installs also copy `CODING_GUIDELINES.md` to the repo root. Global installs skip that file. Codex global skills go to `~/.agents/skills`.

Then run `/sw-pipeline` (Cursor) or the `sw-pipeline` skill in your editor. Codex loads skills from `.agents/skills` (or `~/.agents/skills` when global).

```
sw-pipeline → (trivial? implementer → verifier)
            → else planner → implementer(s) → reviewer → fixer → verifier
```

## Agents

| Agent | Writes? | Role |
| --- | --- | --- |
| `sw-planner` | no | Plan any non-trivial change before editing |
| `sw-implementer` | yes | Writes code to the repo's standards, then runs checks |
| `sw-code-reviewer` | no | Reviews diffs; one `FINDING` line per issue |
| `sw-verifier` | no | Confirms the work exists, is wired, and passes tests |
| `sw-fixer` | yes | Fixes findings, severity-first, max two passes each |
| `sw-researcher` | no | Answers codebase questions with cited evidence |
| `sw-web-researcher` | no | Answers web/docs questions with cited URLs |

`sw-researcher` and `sw-web-researcher` are on-demand. They are not stages in `sw-pipeline`.

## License

[MIT](LICENSE)
