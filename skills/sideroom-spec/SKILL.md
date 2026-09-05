---
name: sideroom-spec
description: Draft a lightweight, implementation-ready feature specification without creating Sideroom project state.
license: MIT
---

# Specification writer

Use this skill when the user asks for a standalone specification rather than an
implementation. Read repository instructions and relevant domain context first.
If scope or product decisions remain open, run `sideroom-grilling` in the current
conversation and wait for a settled understanding.

Draft one English Markdown document with these sections, in this order:

```md
# <Title>

## Context
## Goal
## Non-goals
## Requirements
## Acceptance Criteria
## Constraints
## Open Questions
```

Requirements are concise bullets. Acceptance criteria use observable
Given/When/Then scenarios. Do not invent answers to open decisions; place them
under **Open Questions**.

Show the complete draft in the conversation. Only write it when the user names
an explicit destination and confirms that write. Never initialize
project-local Sideroom state, create task state, or write a specification merely as a side
effect of running this skill.

After confirmation, hand the settled document to the planner; do not implement
the feature yourself.
