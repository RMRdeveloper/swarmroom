---
name: sw-spec
description: >-
  Write a lightweight specification document for a feature or change before
    implementation. Use when the user wants to capture requirements, scope, and
    acceptance criteria as a standalone spec instead of starting the pipeline.
license: MIT
---

Write a single Markdown specification for the requested feature or change and
store it under `.swarmroom/specs/` in the target project root. Do not implement
anything; end by handing off to `sw-pipeline`.

## Project root

Resolve the root of the **target** project, not necessarily the current
working directory:

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

If the request is ambiguous or has unresolved decisions, run the `sw-grilling`
skill first and use its settled understanding. If the request is already
clear, draft directly. Never invent answers to open decisions; leave them as
explicit questions.

## Spec file

One file per request: `.swarmroom/specs/<slug>.md` under the target project root,
where `<slug>` is a kebab-case name derived from the spec title.

If the file already exists, stop: do not overwrite silently and do not
auto-suffix. Offer the user the choice to confirm an update or pick another
slug.

The spec is plain Markdown, no frontmatter, no status fields. Always write in English; keep technical terms, paths, and
`Given/When/Then` syntax as they exist in the repo. Keep section headings in English.

Template (omit any section that would be empty):

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

## Confirm before writing

Show the complete draft and the exact destination path. Write the file only
after explicit user confirmation. Open questions may stay in the spec only if
the user confirms the draft; never hide them.

## Scope of writes

The only file this skill may create or update is the spec under
`.swarmroom/specs/`. Do not touch code, other documentation, `.swarmroom/tasks/`,
and keep it separate from the project's real `docs/` documentation.
or any implementation agent.

## Handoff

After writing, report the created path and suggest the next step:

`/sw-pipeline` with `.swarmroom/specs/<slug>.md` as the reference.
