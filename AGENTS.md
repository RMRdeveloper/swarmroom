# AGENTS.md

## Scope

Swarmroom is a global Pi package with one active coding-agent runtime: Pi via
`@earendil-works/pi-coding-agent`. Its entry point is the `/swarmroom` Pi
extension command. Do not add a standalone CLI, editor installers,
project-local harness files, task persistence, or a subprocess wrapper around
Pi. Preserve the packaged Pi skills; they are loaded through the Pi package
manifest and the SDK. OpenCode is a future runtime and belongs behind
`src/core/model.ts` only when it has a real implementation.

## Source of truth

- `src/assets/agents/*.md` contains the five role prompts.
- `src/assets/artifacts/GUIDELINES_TEMPLATE.md` is the mandatory shared baseline.
- `src/assets/artifacts/guidelines/*.md` adds language-specific policy for
  TypeScript, JavaScript, PHP Laravel, Python, and Java.
- `skills/*/SKILL.md` contains reusable Pi skills, including the pipeline's
  design-tree grilling gate and local audio transcription.
- `src/core/` owns routing and structured role contracts.
- `src/pi-extension.ts` is the Pi command boundary; it must dispatch directly
  to the in-memory pipeline, never by prompting Pi's parent agent.
- `src/runtimes/pi.ts` is the direct Pi SDK boundary. Keep its tool allowlist
  explicit and exclude global Pi resources from role sessions.

## Commands

```bash
npm install
npm run types
npm run lint
npm run format:check
npm test
npm run check
npm run build
```

Use Biome for formatting and linting; do not add ESLint, Prettier, or their
plugins. The package requires Node 22.19 or later because Pi requires it.

## Design rules

- Keep the pipeline in memory. It must not initialize or write Swarmroom
  configuration into the target repository.
- Keep packaged skills global to the install. A skill may write only when the
  user explicitly asks for an output path; it must never create `.swarmroom/`.
- Keep role routing in TypeScript; Markdown contributes instructions only.
- Only implementer and fixer may receive write-capable Pi tools.
- Before every write-capable tool call, the Pi runtime must place the shared
  template and selected language policy before its explicit write gate.
- Make every language guide an equivalent, language-idiomatic rendition of the
  shared examples, not an independent conflicting rulebook.
