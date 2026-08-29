---
name: sw-transcribe-audio
description: >-
  Transcribe a local audio file to text. Use when the user provides a path to
    an mp3, wav, m4a, ogg, or opus recording (including WhatsApp voice notes)
    and needs the spoken content as text.
license: MIT
compatibility: Requires ffmpeg on PATH, Python 3 with faster-whisper via uv, and 809MB Whisper large-v3-turbo model on first run
---

When the user gives a path to an audio file and needs the spoken content as
text, run the companion script next to this skill. Do not invent a transcript.

Supported formats: **mp3**, **wav**, **m4a**, **ogg**, and **opus** (WhatsApp
voice notes).

## Requirements

- **faster-whisper** is obtained by the canonical
  `uv run --with faster-whisper` invoke (see **How to run**). **Python
  dependency setup** is explanatory context only — not a separate install
  step.
- **ffmpeg** is an OS binary, not a pip package. On Ubuntu/WSL:
  `sudo apt install ffmpeg`. Without `ffmpeg` on PATH, `.ogg`/`.opus` and
  other compressed formats fail at decode. **Check this first if the skill
  does not work.**
- First run downloads the Whisper `large-v3-turbo` model (~809MB), then caches it.
  Later runs need no network.

## Python dependency setup

Debian/Ubuntu/WSL ship distro Python as **externally-managed** (PEP 668).
Plain `pip install faster-whisper` then fails with
`externally-managed-environment`. **uv** avoids that automatically: it
isolates the install without a hand-rolled venv or `--break-system-packages`.

Those older paths — `uv pip install faster-whisper`, `uv add faster-whisper`,
a manual venv, or `--break-system-packages` — explain why
`uv run --with faster-whisper` isolates the dependency on each invocation.
They are not agent actions. Do not run them.

If uv is missing, check with `uv --version`. Install via
`curl -LsSf https://astral.sh/uv/install.sh | sh`. Use `pip install uv` only
as a last resort when curl is unavailable.

## How to run

The agent working directory is usually the project root. Invoke the script
from the directory that contains this `SKILL.md` (where `scripts/transcribe.py` is
installed) — resolve via `assetsDir()` / `packageRoot()` semantics when installed (never assume cwd):

```
uv run --with faster-whisper python3 scripts/transcribe.py <audio_path>
```

Do not run `python3 scripts/transcribe.py` directly or install `faster-whisper` separately — `uv run --with faster-whisper` already provides the dependency on every invocation, cached, with no persistent install required.

When the skill is installed via the package, resolve via `packageRoot()` / `assetsDir()` in `src/shared/kernel/package-root.ts`:

```
uv run --with faster-whisper python3 $(node -e "import{packageRoot}from'./src/shared/kernel/package-root.ts';console.log(packageRoot())")/src/assets/skills/sw-transcribe-audio/transcribe.py "<audio_path>"
```

In published mirror use `skills/sw-transcribe-audio/scripts/transcribe.py` (or `scripts/transcribe.py` via `sync-skills`). Quote path if it contains spaces.

## Guardrails

- Path may contain spaces — always quote `"<audio_path>"` (script handles stripped quotes via `Path(...strip('"').strip("'")).expanduser().resolve()`).
- Max ~25MB / 30min CPU recommended; `large-v3-turbo` model is 809MB on first run — OOM risk on constrained runners.
- Validate stdout via `python -m json.tool` — must be `{"language","text"}`; reject if missing keys or non-JSON.

## Missing dependencies

If `ffmpeg` or `uv` is missing (`which ffmpeg` / `which uv` / `shutil.which` check), ask via harness question tool (`ask_user_question` per `sw-grilling` Tooling): (A) Install now (Recommended) / (B) Abort. Only after explicit user accept, run install (`sudo apt install ffmpeg` or `curl -LsSf https://astral.sh/uv/install.sh | sh`). Never auto-install without confirmation.

## Success

Stdout is **only** JSON: `{"language": ..., "text": ...}`. `language` is the
detected language code; `text` is the full transcript. Do not print banners,
progress, or Whisper logs on stdout.

## Errors

Non-zero exit, message on **stderr**, no JSON on stdout:

- missing file
- unsupported extension
- `ffmpeg` missing (the message includes `sudo apt install ffmpeg` and suggests `ask_user_question`)
- `uv` missing
- missing faster-whisper
