#!/usr/bin/env python3
"""voiceover.py — vo.txt -> vo.mp3 for the LaunchReel pipeline.

Primary: ElevenLabs TTS (scoped key). Picks a confident narrator voice from
GET /v1/voices, synthesizes with eleven_v3 (falling back to a stable model),
and writes an MP3. Fallback: the OpenAI gpt-4o-mini-tts script
(skills/openai-genai-assets/scripts/tts.ts via bun) on ANY ElevenLabs failure.

Then wires the track into the storyboard: sets audio.voPath (relative to the
assets dir, e.g. "vo.mp3") so render.ts stages it and the comp ducks music
under the VO.

Usage:
  voiceover.py --vo-txt .tmp/scout/<jid>/vo.txt --out .tmp/scout/<jid>/vo.mp3 \
               [--storyboard .tmp/scout/<jid>/storyboard.json] [--vo-rel vo.mp3] \
               [--voice-id <id>] [--model eleven_v3]

Env: ELEVENLABS_API_KEY (primary), OPENAI_API_KEY (fallback). Reads .env/.env.local.
Exit 0 when an MP3 was produced by either path; 1 if both fail.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELEVEN_BASE = "https://api.elevenlabs.io"
# Preferred + fallback TTS models (eleven_v3 first per the brief; multilingual_v2
# is the most broadly-compatible stable model; turbo is the cheap fast backstop).
ELEVEN_MODELS = ["eleven_v3", "eleven_multilingual_v2", "eleven_turbo_v2_5"]
# Known-good confident male narrator (Liam) if the voices list can't be fetched.
FALLBACK_VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ"
NARRATOR_INSTRUCTIONS = "Confident, warm launch-trailer narrator. Brisk, energetic, clear diction; sell it without shouting."


def log(msg: str) -> None:
    print(f"[voiceover] {msg}", flush=True)


def load_env_key(name: str) -> str:
    val = os.environ.get(name)
    if val:
        return val
    for fname in (".env", ".env.local"):
        path = os.path.join(REPO, fname)
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                for raw in fh:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    if k.strip() == name:
                        v = v.strip().strip('"').strip("'")
                        if v:
                            return v
        except OSError:
            continue
    return ""


def looks_like_mp3(path: str) -> bool:
    try:
        if os.path.getsize(path) < 2048:
            return False
        with open(path, "rb") as fh:
            head = fh.read(3)
        return head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
    except OSError:
        return False


def probe_seconds(path: str) -> float | None:
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return round(float(out), 2)
    except (subprocess.SubprocessError, ValueError):
        return None


# --- ElevenLabs ------------------------------------------------------------

def eleven_get(path: str, key: str) -> dict | list:
    req = urllib.request.Request(ELEVEN_BASE + path, headers={"xi-api-key": key}, method="GET")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def pick_voice(key: str, override: str | None) -> tuple[str, str]:
    """Return (voice_id, name). Score for a confident narrator; fall back to a
    known id if the list can't be fetched."""
    if override:
        return override, "override"
    try:
        data = eleven_get("/v1/voices", key)
        voices = data.get("voices", []) if isinstance(data, dict) else []
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as e:
        log(f"voices list failed ({e}); using fallback voice")
        return FALLBACK_VOICE_ID, "fallback"
    if not voices:
        return FALLBACK_VOICE_ID, "fallback"

    def score(v: dict) -> int:
        lbl = {k: str(val).lower() for k, val in (v.get("labels") or {}).items()}
        s = 0
        desc = lbl.get("descriptive", "")
        use = lbl.get("use_case", "")
        if desc in ("confident", "hyped", "upbeat"):
            s += 4
        if "narrat" in use or "story" in use:
            s += 3
        if use in ("social_media", "conversational", "informative_educational"):
            s += 2
        if lbl.get("gender") == "male":
            s += 2
        if lbl.get("accent") == "american":
            s += 1
        if "character" in use:  # avoid cartoon voices for a product trailer
            s -= 5
        if v.get("category") == "premade":
            s += 1
        return s

    best = max(voices, key=score)
    return best.get("voice_id", FALLBACK_VOICE_ID), best.get("name", "?")


def eleven_tts(text: str, out: str, key: str, voice_id: str, model_id: str) -> bool:
    url = f"{ELEVEN_BASE}/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    body = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "use_speaker_boost": True},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            audio = res.read()
    except urllib.error.HTTPError as e:
        log(f"eleven {model_id}: HTTP {e.code} {e.read().decode()[:180]}")
        return False
    except (urllib.error.URLError, OSError) as e:
        log(f"eleven {model_id}: {e}")
        return False
    with open(out, "wb") as fh:
        fh.write(audio)
    if not looks_like_mp3(out):
        log(f"eleven {model_id}: output not a valid mp3 ({os.path.getsize(out)} bytes)")
        return False
    return True


def try_elevenlabs(text: str, out: str, voice_override: str | None, model_pref: str) -> dict | None:
    key = load_env_key("ELEVENLABS_API_KEY")
    if not key:
        log("no ELEVENLABS_API_KEY — skipping to OpenAI fallback")
        return None
    voice_id, voice_name = pick_voice(key, voice_override)
    models = [model_pref] + [m for m in ELEVEN_MODELS if m != model_pref]
    for model_id in models:
        log(f"eleven try: voice={voice_name}({voice_id}) model={model_id}")
        if eleven_tts(text, out, key, voice_id, model_id):
            return {"provider": "elevenlabs", "voice_id": voice_id, "voice_name": voice_name, "model": model_id}
    return None


# --- OpenAI fallback -------------------------------------------------------

def try_openai(vo_txt_path: str, out: str) -> dict | None:
    runtime = "bun" if shutil.which("bun") else ("node" if shutil.which("node") else None)
    script = os.path.join(REPO, "skills", "openai-genai-assets", "scripts", "tts.ts")
    if not runtime or not os.path.exists(script):
        log(f"openai fallback unavailable (runtime={runtime}, script exists={os.path.exists(script)})")
        return None
    argv = ([runtime, "run", script] if runtime == "bun" else [runtime, script]) + [
        "--textfile", vo_txt_path, "--out", out,
        "--model", "gpt-4o-mini-tts", "--voice", "onyx",
        "--instructions", NARRATOR_INSTRUCTIONS, "--format", "mp3",
    ]
    log(f"openai fallback: gpt-4o-mini-tts voice=onyx via {runtime}")
    try:
        r = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, timeout=180)
    except subprocess.SubprocessError as e:
        log(f"openai fallback failed to run: {e}")
        return None
    if r.returncode != 0 or not looks_like_mp3(out):
        log(f"openai fallback failed: rc={r.returncode} {r.stderr.strip()[:200]}")
        return None
    return {"provider": "openai", "voice_name": "onyx", "model": "gpt-4o-mini-tts"}


# --- storyboard wiring -----------------------------------------------------

def wire_storyboard(storyboard_path: str, vo_rel: str) -> bool:
    try:
        with open(storyboard_path, encoding="utf-8") as fh:
            sb = json.load(fh)
    except (OSError, ValueError) as e:
        log(f"could not read storyboard to wire voPath: {e}")
        return False
    audio = sb.get("audio")
    if not isinstance(audio, dict):
        audio = {}
    audio["voPath"] = vo_rel
    sb["audio"] = audio
    with open(storyboard_path, "w", encoding="utf-8") as fh:
        json.dump(sb, fh, indent=2)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel voiceover — vo.txt to vo.mp3")
    ap.add_argument("--vo-txt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--storyboard", default=None, help="storyboard.json to wire audio.voPath into")
    ap.add_argument("--vo-rel", default=None, help="voPath value stored in the storyboard (default basename of --out)")
    ap.add_argument("--voice-id", default=None, help="force a specific ElevenLabs voice id")
    ap.add_argument("--model", default="eleven_v3", help="preferred ElevenLabs model")
    args = ap.parse_args()

    if not os.path.exists(args.vo_txt):
        log(f"ERROR: vo script not found: {args.vo_txt}")
        return 1
    with open(args.vo_txt, encoding="utf-8") as fh:
        text = fh.read().strip()
    if not text:
        log("ERROR: vo script is empty")
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    meta = try_elevenlabs(text, args.out, args.voice_id, args.model)
    if not meta:
        meta = try_openai(args.vo_txt, args.out)
    if not meta:
        log("ERROR: both ElevenLabs and OpenAI TTS failed")
        return 1

    seconds = probe_seconds(args.out)
    meta.update({"out": os.path.abspath(args.out), "bytes": os.path.getsize(args.out),
                 "seconds": seconds, "words": len(text.split())})

    vo_rel = args.vo_rel or os.path.basename(args.out)
    if args.storyboard:
        if wire_storyboard(args.storyboard, vo_rel):
            meta["wired_voPath"] = vo_rel
            log(f"wired audio.voPath={vo_rel!r} into {args.storyboard}")

    log(f"done: {meta['provider']} {meta.get('model')} -> {args.out} "
        f"({meta['bytes']//1024} KB, {seconds}s)")
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main())
