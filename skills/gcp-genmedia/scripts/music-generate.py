#!/usr/bin/env python3
"""Generate a short instrumental music clip with Google Lyria 3 (:generateContent).

Usage:
  music-generate.py "PROMPT" --out track.mp3 [options]

Options:
  --out PATH    output file (default: lyria-music.mp3; .wav if the model returns PCM)
  --model ID    default: lyria-3-clip-preview (also: lyria-3-pro-preview)
  --backend B   auto (default) | vertex | gemini
  --project ID  GCP project (Vertex)
  --region R    Vertex region (default us-central1)

Prompt tips: Lyria applies a strict copyright filter (finishReason OTHER +
"resembles existing copyrighted works"). Describe key / instrumentation / tempo /
mood in the abstract; avoid artist names, song titles, or "sounds like <band>".

Auth: vertex -> gcloud token (draws GCP credits); gemini -> $GEMINI_API_KEY.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _genmedia_common as g  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Generate music via Lyria 3.")
    ap.add_argument("prompt")
    ap.add_argument("--out", default="lyria-music.mp3")
    ap.add_argument("--model", default="lyria-3-clip-preview")
    ap.add_argument("--backend", default="auto")
    ap.add_argument("--project", default=None)
    ap.add_argument("--region", default=g.vertex_region())
    a = ap.parse_args()

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

    g.log(f"backend={backend} model={a.model}")
    t = time.time()
    st, resp = g.post_json(url, headers,
                           {"contents": [{"role": "user", "parts": [{"text": a.prompt}]}]})
    if st != 200:
        g.die(f"generateContent failed (HTTP {st}): {resp}")
    cand = (resp.get("candidates") or [{}])[0]
    if cand.get("finishReason") not in (None, "STOP"):
        g.log(f"finishReason={cand.get('finishReason')} :: {cand.get('finishMessage','')}")
    raw, mime = g.first_inline(cand.get("content", {}).get("parts", []))
    if not raw:
        g.die(f"no audio (finishReason={cand.get('finishReason')}); rephrase the prompt")

    out = a.out
    if "l16" in mime.lower() or "pcm" in mime.lower():
        rate, ch = g.parse_audio_mime(mime)
        out = os.path.splitext(out)[0] + ".wav"
        g.pcm_to_wav(out, raw, rate=rate, channels=ch)
    else:
        ext = {"audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav",
               "audio/ogg": ".ogg"}.get(mime.split(";")[0], os.path.splitext(out)[1] or ".bin")
        out = os.path.splitext(out)[0] + ext
        g.save(out, raw)
    g.log(f"OK {len(raw)} bytes -> {out} ({mime}) in {time.time()-t:.1f}s (backend={backend})")
    print(out)


if __name__ == "__main__":
    main()
