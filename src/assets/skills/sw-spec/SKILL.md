---
name: sw-spec
description: >-
  Write a lightweight specification document for a feature or change before
  implementation. Use when the user wants to capture requirements, scope, and
  acceptance criteria as a standalone spec instead of starting the pipeline.
argument-hint: Describe the feature or change to specify.
disable-model-invocation: true
---

Write a single Markdown specification for the requested feature or change and
store it under `.swarmroom/specs/` in the target project root. Do not implement
anything; end by handing off to `sw-pipeline`.

## Project root

Resolve the root of the **target** project, not necessarily the current
working directory — resolve via `packageRoot()` semantics (walk up to `package.json`) in `src/shared/kernel/package-root.ts`. If ambiguous or missing, ask via harness question tool (`ask_user_question` per `sw-grilling` Tooling) — never guess.

- If the user names a project or path, resolve it there.
- Otherwise, use the project root of the current session.

Confirm the resolved root with the user only when it is ambiguous. If no root
can be resolved unambiguously, stop and ask.

## Read-first (constraints, not guesses)

Read only what exists at the resolved root:

- `CODING_GUIDELINES.md`
- `AGENTS.md` / `CLAUDE.md`
- `CONTEXT.md` / `CONTEXT-MAP.md`

When present, treat them as hard constraints. Do not invent standards that
contradict them. If missing, say so and continue with the baseline the caller
already uses.

## Clarify before drafting

If the request is ambiguous or has unresolved decisions, invoke `sw-grilling` IN THIS CONVERSATION via harness question tool (Pi `ask_user_question` per `sw-grilling` Tooling, ≤3 Q, Recommended first). Do NOT delegate to subagent. Pause and wait — same gate as `sw-pipeline`. Use its settled understanding. If the request is already clear, draft directly. Never invent answers to open decisions; leave them as explicit questions.

## Spec file

One file per request: `.swarmroom/specs/<slug>.md` under the target project root,
where `<slug>` = kebab-case of title, `[a-z0-9-]`, ≤60 chars. Check `existsSync(.swarmroom/specs/<slug>.md)` before draft.

If the file already exists, stop: do not overwrite silently and do not
auto-suffix. Offer the user the choice to confirm an update or pick another
slug. If file exists, STOP and ask via `ask_user_question` (Overwrite / Pick new slug).

The spec is plain Markdown, no frontmatter (`---` forbidden), no status fields. Must end with `\n`. Always write in English; keep technical terms, paths, and `Given/When/Then` syntax as they exist in the repo. Keep section headings in English and in order: `Context / Goal / Non-goals / Requirements / Acceptance Criteria / Constraints / Open Questions`. Validate via `node src/assets/artifacts/validate-spec.mjs --file <path>` (or `node $(node -e "import{packageRoot}from'./src/shared/kernel/package-root.ts'")/src/assets/artifacts/validate-spec.mjs --file <path>` in published install). Reject if frontmatter, wrong slug, empty section, or missing `Given/When/Then` in Acceptance Criteria.

Template (omit any section that would be empty, but never leave a present section empty):

```markdown
# <Title>

## Context

<why this exists>

## Goal

<what the result must do>

## Non-goals

<what is explicitly out of scope>

## Requirements

- <one requirement per bullet>

## Acceptance Criteria

- **Scenario:** <name>
  - Given <precondition>
  - When <action>
  - Then <observable result>

## Constraints

- <technical, process, or repo-doc constraint>

## Open Questions

- <unresolved non-blocking decisions, if any>
```

Spec file MUST be English, headings exactly as above and in order. Validate after draft via `validate-spec.mjs` — reject if empty section, frontmatter, wrong slug, or missing `Given/When/Then`.

## Confirm before writing

Show the complete draft and the exact destination path. Write the file only
after explicit user confirmation. Open questions may stay in the spec only if
the user confirms the draft; never hide them.

## Scope of writes

The ONLY writable path is `.swarmroom/specs/<slug>.md` — the only file this skill may create or update is the spec under `.swarmroom/specs/`. Forbidden: `src/**`, `docs/**`, `.swarmroom/tasks/**`, `.swarmroom/artifacts/**`. If file exists, STOP and ask via `ask_user_question` (Overwrite / Pick new slug). Do not touch code, other documentation, `.swarmroom/tasks/`, and keep it separate from the project's real `docs/` documentation or any implementation agent.

## Handoff

After writing, report the created path and suggest the next step:

`/sw-pipeline` with `.swarmroom/specs/<slug>.md` as the reference.
