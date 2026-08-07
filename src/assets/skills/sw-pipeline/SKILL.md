---
name: sw-pipeline
description: Run the full sw-* pipeline — planner, implementer, code-reviewer, verifier, fixer.
argument-hint: Describe the feature/task to build or the diff to review.
disable-model-invocation: true
---

Run the sw-\* pipeline end to end, delegating each stage to its subagent
(`sw-planner`, `sw-implementer`, `sw-code-reviewer`, `sw-verifier`,
`sw-fixer`), not substituting your own judgement.

1. sw-planner — read-first (CODING_GUIDELINES.md / AGENTS.md / CONTEXT.md), then plan. Show it.
   For non-trivial work, if a `grilling` skill is available, only the planner runs it.
2. sw-implementer — implement the plan; run the repo's lint/tests before done.
3. sw-code-reviewer — review diff; one line per finding:
   `FINDING <N> | <Critical|High|Medium> | <file:line> | <rule> | <description>`
4. sw-verifier — confirm it exists, passes tests, covers edge cases.
5. sw-fixer — fix findings in place, severity-first, max 2 passes, re-verify.

If a stage reports Critical findings, don't advance: loop implementer→fixer until clean.
Report each stage's output, not a summary.