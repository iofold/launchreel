#!/usr/bin/env python3
"""frame-qa.py — LaunchReel vision rig v1 (the still-frame quality gate).

Extracts N evenly-spaced frames from a trailer with ffmpeg and sends them to a
Gemini flash model as a structured-output judge. Scores the four rubric
dimensions that are assessable from stills:

  - brand_fidelity        palette / logo / tone match the source brand
  - text_legibility       every on-screen word crisp (auto-fail if gen-video smeared)
  - real_ui_truthfulness  Product-Tour UI is real, not hallucinated
  - cta_watermark         CTA end-card with correct URL present; watermark on free tier

Writes a scorecard: {video, model, frames, scores, evidence, model_verdict,
verdict, notes}. The top-level `verdict` is computed deterministically in this
script from the scores + auto-fail rules (auditable), NOT by the model; the
model's own gut call is recorded separately as `model_verdict`.

Scope: this is the STILLS gate. A `pass` here means the frames are
shippable-quality; it does NOT clear motion-quality, VO/audio-sync, or the
6-scene contract — those need the video-level or human check (see eval/rubric.md).

Deps: Python 3 stdlib + ffmpeg/ffprobe on PATH. No pip installs.
Key:  GEMINI_API_KEY in env, or --env-file (defaults to manifold hermes .env).

Usage:
  frame-qa.py --video PATH [--brand-json PATH] --out scorecard.json
              [--frames 8] [--model gemini-2.5-flash] [--tier free|paid]
              [--expect-url URL] [--env-file PATH]
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_ENV = "/home/ubuntu/workspace/manifold/ops/hermes/.env"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

STILL_DIMS = ["brand_fidelity", "text_legibility", "real_ui_truthfulness", "cta_watermark"]
# Dimensions where a low score means "ship a broken video" -> hard re-render, not a human coin-flip.
AUTO_FAIL_DIMS = ["text_legibility", "real_ui_truthfulness"]
AUTO_FAIL_AT = 2  # score <= this on an auto-fail dim => verdict fail


def load_api_key(env_file: str) -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    if env_file and os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("GEMINI_API_KEY not found (env or --env-file). Refusing to run.")


def probe_duration(video: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:
        sys.exit(f"could not read duration from {video}: {out!r}")


def extract_frames(video: str, n: int, workdir: str) -> list[str]:
    """N evenly-spaced JPEG frames, sampled at the midpoint of each 1/N slice."""
    dur = probe_duration(video)
    paths = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        out = os.path.join(workdir, f"frame_{i:02d}.jpg")
        # accurate seek (-ss after -i), downscale long edge to 1024 to keep the
        # payload cheap while preserving text legibility, JPEG q=4.
        subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-y",
             "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
             "-vf", "scale='min(1024,iw)':-2", "-q:v", "4", out],
            check=True,
        )
        if os.path.exists(out) and os.path.getsize(out) > 0:
            paths.append((round(t, 2), out))
    if not paths:
        sys.exit("ffmpeg extracted zero frames")
    return paths


def build_prompt(brand: dict | None, tier: str, expect_url: str | None) -> str:
    brand_block = "No brand ground-truth was provided. Judge brand fidelity by INTERNAL consistency: is there a coherent, deliberate palette and a consistent logo/wordmark across frames, or does it look like an off-brand generic template?"
    if brand:
        brand_block = (
            "Brand ground-truth for the source company (score brand_fidelity AGAINST this):\n"
            + json.dumps(brand, ensure_ascii=False, indent=2)
        )
    url_block = (
        f"Expected CTA URL: {expect_url}. The CTA end-card must show exactly this (typos/wrong domain = fail cta_watermark)."
        if expect_url else
        "No expected URL was supplied; check only that a CTA end-card with SOME legible product URL/wordmark is present."
    )
    watermark_rule = (
        "This is a FREE-tier trailer: a visible LaunchReel watermark MUST be present in the frames. Missing watermark => cta_watermark <= 2."
        if tier == "free" else
        "This is a PAID-tier trailer: NO watermark should be present. A leftover watermark => cta_watermark <= 2."
    )
    return f"""You are a strict QA judge for AI-generated SaaS launch-trailer videos. You are shown {{n}} still frames sampled evenly across ONE trailer, in time order (frame 0 = start, last = end). Judge ONLY what stills can show. Do not reward motion you cannot see.

Score each dimension 1-5 using these anchors (be harsh; 5 is reserved):
- brand_fidelity — 1: wrong/absent palette, no logo, generic template. 3: right general vibe but off accent color or inconsistent logo. 5: palette, logo and tone are unmistakably this brand across every frame.
- text_legibility — 1: headline/UI text is smeared, warped, or gibberish (classic gen-video artifact). 3: mostly readable, one soft or slightly warped word. 5: every on-screen word is razor-crisp with correct spelling.
- real_ui_truthfulness — 1: shows an obviously fake/hallucinated product dashboard (invented widgets, nonsense labels, warped charts). 3: plausible UI but you cannot confirm it's the real product. 5: frames clearly show a real, coherent product interface (or, if no product UI is shown at all, honest abstract/brand b-roll that does NOT pretend to be UI — that also earns 5, note it).
- cta_watermark — 1: no CTA end-card and no URL anywhere. 3: a CTA/wordmark exists but URL is unclear, wrong, or the watermark rule below is violated. 5: clean CTA end-card, correct legible URL, watermark rule satisfied.

{brand_block}

{url_block}
{watermark_rule}

For each dimension give: score (1-5), confidence (high|medium|low — low if the frames simply don't contain enough to judge it), and 1-2 evidence items each naming the frame_index you saw it in and a concrete observation. Then give your own gut model_verdict (pass|fail|needs_human) and a one-sentence notes summary. Auto-fail intuition: smeared text or hallucinated UI should push you toward fail regardless of the other dimensions."""


def response_schema() -> dict:
    dim_schema = {
        "type": "object",
        "properties": {
            "score": {"type": "integer"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        },
        "required": ["score", "confidence"],
    }
    return {
        "type": "object",
        "properties": {
            "scores": {
                "type": "object",
                "properties": {d: dim_schema for d in STILL_DIMS},
                "required": STILL_DIMS,
            },
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "dimension": {"type": "string", "enum": STILL_DIMS},
                        "frame_index": {"type": "integer"},
                        "observation": {"type": "string"},
                    },
                    "required": ["dimension", "frame_index", "observation"],
                },
            },
            "model_verdict": {"type": "string", "enum": ["pass", "fail", "needs_human"]},
            "notes": {"type": "string"},
        },
        "required": ["scores", "evidence", "model_verdict", "notes"],
    }


def call_gemini(model: str, key: str, prompt: str, frames: list, temperature: float = 0.0) -> dict:
    parts = [{"text": prompt.replace("{n}", str(len(frames)))}]
    for idx, (_t, path) in enumerate(frames):
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        parts.append({"text": f"frame_index {idx}:"})
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": response_schema(),
            "temperature": temperature,
        },
    }
    url = GEMINI_URL.format(model=model, key=key)
    data = json.dumps(body).encode()
    last_err = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=120) as res:
                payload = json.load(res)
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            usage = payload.get("usageMetadata", {})
            parsed = json.loads(_strip_fences(text))
            parsed["_usage"] = usage
            return parsed
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode()[:400]}"
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
    sys.exit(f"Gemini call failed after retries: {last_err}")


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def compute_verdict(scores: dict) -> tuple[str, list[str]]:
    """Deterministic gate. fail on any auto-fail dim; pass only if all still
    dims >=3 and mean >=4; else needs_human. Returns (verdict, reasons)."""
    reasons = []
    vals = {d: scores[d]["score"] for d in STILL_DIMS}
    for d in AUTO_FAIL_DIMS:
        if vals[d] <= AUTO_FAIL_AT:
            reasons.append(f"AUTO-FAIL: {d}={vals[d]} (<= {AUTO_FAIL_AT})")
    if reasons:
        return "fail", reasons
    mean = sum(vals.values()) / len(vals)
    below3 = [d for d, v in vals.items() if v < 3]
    if below3:
        reasons.append(f"dimension(s) below 3: {', '.join(f'{d}={vals[d]}' for d in below3)}")
        return "needs_human", reasons
    if mean >= 4.0:
        reasons.append(f"all still dims >=3 and mean={mean:.2f} >= 4.0 (stills gate clear; motion/VO/scene-contract still need video-level or human check)")
        return "pass", reasons
    reasons.append(f"no auto-fail and all dims >=3 but mean={mean:.2f} < 4.0")
    return "needs_human", reasons


def main() -> None:
    ap = argparse.ArgumentParser(description="LaunchReel still-frame QA vision rig")
    ap.add_argument("--video", required=True)
    ap.add_argument("--brand-json", default=None, help="optional brand ground-truth {palette, logo, tone}")
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--tier", choices=["free", "paid"], default="free")
    ap.add_argument("--expect-url", default=None)
    ap.add_argument("--env-file", default=DEFAULT_ENV)
    args = ap.parse_args()

    if not os.path.exists(args.video):
        sys.exit(f"video not found: {args.video}")
    key = load_api_key(args.env_file)
    brand = None
    if args.brand_json:
        with open(args.brand_json) as f:
            brand = json.load(f)

    with tempfile.TemporaryDirectory() as workdir:
        frames = extract_frames(args.video, args.frames, workdir)
        prompt = build_prompt(brand, args.tier, args.expect_url)
        result = call_gemini(args.model, key, prompt, frames)

    verdict, reasons = compute_verdict(result["scores"])
    scorecard = {
        "video": os.path.abspath(args.video),
        "model": args.model,
        "tier": args.tier,
        "expect_url": args.expect_url,
        "brand_json": os.path.abspath(args.brand_json) if args.brand_json else None,
        "frames_sampled": [{"index": i, "t_seconds": t} for i, (t, _p) in enumerate(frames)],
        "scores": result["scores"],
        "evidence": result["evidence"],
        "model_verdict": result["model_verdict"],
        "verdict": verdict,
        "verdict_reasons": reasons,
        "notes": result.get("notes", ""),
        "usage": result.get("_usage", {}),
        "scope": "STILLS GATE ONLY — motion quality, VO/audio-sync, and 6-scene contract are NOT assessed here.",
    }
    with open(args.out, "w") as f:
        json.dump(scorecard, f, indent=2)

    vals = {d: result["scores"][d]["score"] for d in STILL_DIMS}
    print(f"[frame-qa] {os.path.basename(args.video)}  model={args.model}  frames={len(frames)}")
    print(f"[frame-qa] scores: " + "  ".join(f"{d}={vals[d]}" for d in STILL_DIMS))
    print(f"[frame-qa] VERDICT: {verdict}  (model said: {result['model_verdict']})")
    for r in reasons:
        print(f"[frame-qa]   - {r}")
    print(f"[frame-qa] scorecard -> {args.out}")


if __name__ == "__main__":
    main()
