#!/usr/bin/env python3
import json
import shutil
import sys
from pathlib import Path

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".opus"}


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


if len(sys.argv) < 2:
    fail("usage: uv run --with faster-whisper python3 transcribe.py <audio_path>")

audio_path = Path(sys.argv[1])
if not audio_path.is_file():
    fail(f"not a file: {audio_path}")

suffix = audio_path.suffix.lower()
if suffix not in ALLOWED_EXTENSIONS:
    allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
    fail(f"unsupported extension {suffix!r}; allowed: {allowed}")

if shutil.which("ffmpeg") is None:
    fail("ffmpeg is not on PATH; install the OS binary: sudo apt install ffmpeg")

try:
    from faster_whisper import WhisperModel
except ImportError:
    fail(
        "This script must be invoked with: uv run --with faster-whisper python3 transcribe.py <audio_path>. "
        "Do not run it with python3 directly or install faster-whisper separately."
    )

model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
segments, transcription_info = model.transcribe(str(audio_path))
text = "".join(segment.text for segment in segments).strip()
print(json.dumps({"language": transcription_info.language, "text": text}, ensure_ascii=False))
