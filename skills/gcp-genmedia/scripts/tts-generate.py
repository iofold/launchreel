#!/usr/bin/env python3
"""Generate narrator speech with Gemini TTS (:generateContent, AUDIO modality).

The model returns 16-bit PCM (audio/L16, usually 24 kHz mono); this script wraps it
into a playable .wav.

Usage:
  tts-generate.py "TEXT TO SPEAK" --out line.wav [options]

Options:
  --out PATH    output wav (default: tts.wav)
  --model ID    default: gemini-3.1-flash-tts-preview
                (also: gemini-2.5-flash-preview-tts | gemini-2.5-pro-preview-tts)
  --voice NAME  prebuilt voice (default Kore; e.g. Puck, Charon, Kore, Fenrir, Aoede)
  --backend B   auto (default) | vertex | gemini
  --project ID  GCP project (Vertex)
  --region R    Vertex region (default us-central1)

Style is prompt-steerable: prefix the text with a direction, e.g.
  "Say in a warm, confident announcer voice: Your launch trailer, in minutes."

Auth: vertex -> gcloud token (draws GCP credits); gemini -> $GEMINI_API_KEY.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _genmedia_common as g  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Generate speech via Gemini TTS.")
    ap.add_argument("text")
    ap.add_argument("--out", default="tts.wav")
    ap.add_argument("--model", default="gemini-3.1-flash-tts-preview")
    ap.add_argument("--voice", default="Kore")
    ap.add_argument("--backend", default="auto")
    ap.add_argument("--project", default=None)
    ap.add_argument("--region", default=g.vertex_region())
    a = ap.parse_args()

    body = {
        "contents": [{"role": "user", "parts": [{"text": a.text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": a.voice}}},
        },
    }

    backend = g.resolve_backend(a.backend)
    if backend == "vertex":
        project = a.project or g.vertex_project()
        if not project:
            g.die("no project for vertex (pass --project or set $GENMEDIA_PROJECT)")
        url = g.vertex_model_url(project, a.region, a.model, "generateContent")
        headers = g.bearer(g.vertex_token())
    else:
        url = g.gemini_model_url(a.model, "generateContent")
        headers = g.apikey_header(g.gemini_key())

    g.log(f"backend={backend} model={a.model} voice={a.voice}")
    t = time.time()
    st, resp = g.post_json(url, headers, body)
    if st != 200:
        g.die(f"generateContent failed (HTTP {st}): {resp}")
    cand = (resp.get("candidates") or [{}])[0]
    raw, mime = g.first_inline(cand.get("content", {}).get("parts", []))
    if not raw:
        g.die(f"no audio (finishReason={cand.get('finishReason')}): {str(resp)[:300]}")

    out = os.path.splitext(a.out)[0] + ".wav"
    rate, ch = g.parse_audio_mime(mime)
    g.pcm_to_wav(out, raw, rate=rate, channels=ch)
    g.log(f"OK {len(raw)} bytes -> {out} ({rate}Hz {ch}ch) in {time.time()-t:.1f}s (backend={backend})")
    print(out)


if __name__ == "__main__":
    main()
