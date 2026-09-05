# Sideroom Pi

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages). It
registers the `/sideroom` command inside Pi and runs planner, implementer,
reviewer, verifier, and fixer as isolated Pi SDK sessions.

It creates no `.pi` configuration, task graph, harness state, or other files
in the repository being changed.

## Install globally in Pi

Build the package, then let Pi install it globally. Do not use `-l`: that
would create project-local configuration.

```bash
npm install
npm run build
pi install /absolute/path/to/sideroom-pi
```

For a published release:

```bash
pi install npm:@rmrdeveloper/sideroom-pi@5.0.0
```

Start Pi from the repository you want to work in, then invoke the extension:

```text
/sideroom "Add a health endpoint"
/sideroom --language php-laravel "Add invoice export"
/sideroom --read-only "Review the retry behavior"
```

Pi extension commands are necessarily slash commands, so `/sideroom` is the
single command; there is no subcommand or separate binary to run. When the
request is omitted, Pi asks for it using its own UI.

Supported guideline variants are `typescript` (default), `javascript`,
`php-laravel`, `python`, and `java`. `--read-only` removes write-capable tools
from every role. `--max-fix-passes <number>` changes the default limit of two
repair passes.

## Provenance and isolation

`/sideroom` is dispatched to the extension before Pi expands skills or sends
the command to the interactive agent. The extension then creates direct,
in-memory SDK sessions for the five Sideroom roles. Those child sessions load
only this package's skills and explicit policy; global Pi skills, extensions,
prompt templates, and global context files are excluded.

At the end of every run, Pi displays a `Sideroom completed` or `Sideroom
failed` message with its provenance and the completed roles. It also records
the same trace in Pi's session history as `sideroom:run`; this is Pi session
metadata, never a file in the target repository.

The packaged `sideroom-grilling` skill runs as the design-decision gate. Its
questions use Pi's native decision UI. During a run, a persistent Pi widget
shows the active phase, the waiting-for-answer state, and the direct-SDK
provenance. Selecting a recommendation accepts it; selecting the alternate
option opens a custom-answer field. The widget is removed automatically when a
run completes or fails; the final Pi session message remains as the durable
record. It is not a request to any global skill with the same name.

## Content and guidelines

The five role prompts are in `src/assets/agents/`. The shared policy is
`src/assets/artifacts/GUIDELINES_TEMPLATE.md`; the language layers live in
`src/assets/artifacts/guidelines/`. Implementer and fixer receive those
policies before their write gate and must read them before every code-writing
tool call.

Reusable Pi skills ship in `skills/`: `sideroom-grilling`, `sideroom-critic`,
`sideroom-spec`, and `sideroom-transcribe-audio`. Pi loads them directly through
the package manifest.
The transcription skill needs `uv`, Python, and `ffmpeg` only when explicitly
used.

## Development

```bash
npm install
npm run check
npm run build
```

Biome is the sole formatter and linter. Runtime code uses Pi's SDK only; Pi
provides `@earendil-works/pi-coding-agent` as a peer dependency.

## Releases and commits

Commit messages must follow the Conventional Commits format. The existing
Husky `commit-msg` hook validates each local commit with Commitlint, for
example `feat: add a pipeline summary` or `fix: validate malformed findings`.

Every user-visible package change needs a Changeset. Create one with:

```bash
npm run changeset
```

Review pending release work with `npm run changeset:status`. On the release
branch, run `npm run version-packages`, review and commit the updated
`package.json`, `package-lock.json`, and `CHANGELOG.md`, then publish
deliberately with `npm run release`. The repository does not publish
automatically from CI.

## Layout

```text
src/
  pi-extension.ts        Pi extension entry point for /sideroom
  pi-command.ts          slash-command parsing
  app.ts                 Pi pipeline assembly
  core/                  orchestration, roles, contracts, and content catalog
  runtimes/pi.ts         direct Pi SDK adapter for isolated child sessions
  assets/                role prompts and coding guidelines
skills/                  package-provided Pi skills
```
