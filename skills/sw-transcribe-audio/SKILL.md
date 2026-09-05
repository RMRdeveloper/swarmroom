---
name: sw-transcribe-audio
description: Transcribe a local mp3, wav, m4a, ogg, or opus recording to JSON text.
license: MIT
compatibility: Requires ffmpeg on PATH, Python 3, uv, and a first-run Whisper large-v3-turbo download.
---

# Audio transcription

Use this skill only when the user supplies a local audio-file path and asks for
a transcript. Do not invent or summarize a transcript without running the
companion script.

Supported extensions are `mp3`, `wav`, `m4a`, `ogg`, and `opus`. Resolve the
script relative to this skill directory, quote the audio path, and run:

```sh
uv run --with faster-whisper python3 scripts/transcribe.py "<audio_path>"
```

`uv run --with faster-whisper` creates the isolated dependency environment;
do not separately install `faster-whisper` or create a virtual environment.
The first run downloads the roughly 809 MB `large-v3-turbo` model and later
runs use its cache.

Check for `ffmpeg` and `uv` first. On Ubuntu or WSL, `ffmpeg` can be installed
with `sudo apt install ffmpeg`; ask for explicit confirmation before installing
anything. The same applies if `uv` is missing. Keep the recommended workload
under roughly 25 MB or 30 minutes of audio on CPU-constrained hosts.

The script writes only this JSON object to stdout:

```json
{"language":"<detected-code>","text":"<transcript>"}
```

Treat non-zero exit status, non-JSON output, a missing file, an unsupported
extension, or a missing dependency as an error and report its stderr message.
