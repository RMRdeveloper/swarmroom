# swarmroom

[![CI](https://img.shields.io/github/actions/workflow/status/RMRdeveloper/swarmroom/ci.yml?branch=main)](https://github.com/RMRdeveloper/swarmroom/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@rmrdeveloper/swarmroom)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![node](https://img.shields.io/node/v/@rmrdeveloper/swarmroom)](https://www.npmjs.com/package/@rmrdeveloper/swarmroom)
[![license](https://img.shields.io/github/license/RMRdeveloper/swarmroom)](LICENSE)

Same coding agents and skills in **Cursor**, **opencode**, **Claude Code**, and **Codex**. One install; each editor gets files it already knows how to load.

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
| Cursor | `.cursor/agents/*.md` | `.cursor/skills/<name>/` |
| opencode | `.opencode/agent/*.md` | `.opencode/skill/<name>/` |
| Claude Code | `.claude/agents/*.md` | `.claude/skills/<name>/` |
| Codex | `.codex/agents/*.toml` | `.agents/skills/<name>/` |

Each skill folder includes `SKILL.md`. Skills that ship a helper script get that file copied as-is next to it (today: `transcribe-audio` → `transcribe.py`).

Project installs also copy `CODING_GUIDELINES.md` to the repo root. Global installs skip that file. Codex global skills go to `~/.agents/skills`.

Then run `/sw-pipeline` (Cursor) or the matching skill in your editor. Codex loads skills from `.agents/skills` (or `~/.agents/skills` when global).

```
sw-pipeline → (trivial? implementer → verifier)
            → else planner → critic → implementer(s) → reviewer∥critic → fixer → verifier
```

On **Critical** from the plan-stage critic, the pipeline replans (back to planner). For non-trivial work, the planner runs `grilling` first when that skill is installed.

## Skills

| Skill | Role |
| --- | --- |
| `sw-pipeline` | Runs the agent sequence end to end. Does not substitute its own judgement for the specialists. |
| `grilling` | Stress-tests a plan, decision, or feature until you share one understanding. Does not write code. |
| `transcribe-audio` | Turns a local audio file (mp3, wav, m4a, ogg/opus, including WhatsApp voice notes) into text on your machine. Needs Python `faster-whisper`, OS `ffmpeg`, and a first-run download of the Whisper `large-v3-turbo` model (~809MB). |

## Agents

| Agent | Writes? | Role |
| --- | --- | --- |
| `sw-planner` | no | Plan any non-trivial change before editing |
| `sw-implementer` | yes | Writes code to the repo's standards, then runs checks |
| `sw-critic` | no | Adversarial Red Team critique of plans and implementations (logical failures, assumptions, architecture, YAGNI); not style review (`sw-code-reviewer`) or verify-runs (`sw-verifier`) |
| `sw-code-reviewer` | no | Reviews diffs; one `FINDING` line per issue |
| `sw-verifier` | no | Confirms the work exists, is wired, and passes tests |
| `sw-fixer` | yes | Fixes findings, severity-first, max two passes each |
| `sw-researcher` | no | Answers codebase questions with cited evidence |
| `sw-web-researcher` | no | Answers web/docs questions with cited URLs |

`sw-researcher` and `sw-web-researcher` are on-demand. They are not stages in `sw-pipeline`.

## License

[MIT](LICENSE)
