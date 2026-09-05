---
name: sideroom-critic
description: Adversarially stress-test a plan or diff for concrete logical, architectural, and scope failures.
license: MIT
---

# Adversarial critic

Use this skill only when the user explicitly requests a red-team review of a
non-trivial plan or implementation. It is not an automatic replacement for the
pipeline reviewer or verifier.

Read repository instructions, relevant domain context, the plan or diff, and
the affected code before drawing conclusions. Verify facts with the available
tools; do not report speculative risks.

Attack only concrete concerns that ordinary implementation review can miss:

- a reproducible edge case, invalid state, race, or broken invariant;
- an unsupported business assumption, with the missing evidence identified;
- a real dependency-direction, Law of Demeter, CQS, composition, or
  validate-once violation, including the concrete call or import chain;
- scope mismatch, YAGNI, or a required case that is unhandled.

For each finding, give a counterexample or precise consequence. Do not report
formatting, naming, or generic style preferences. Do not edit code.

Return either `No findings` or one record per issue:

```
FINDING <N> | <Critical|High|Medium|Low> | <file:line> | <rule> | <description>
```
