#!/usr/bin/env python3
"""Generate still image(s) with Google Imagen or the Nano Banana / Gemini image models.

Two request shapes are dispatched by model id:
  * imagen-*            -> :predict          (parameters.sampleCount / aspectRatio)
  * nano-banana* / gemini-*-image -> :generateContent (returns inlineData image parts)

Usage:
  image-generate.py "PROMPT" --out hero.png [options]

Options:
  --out PATH      output file base (default: image.png). With --count>1, an index
                  is inserted before the extension (hero-1.png, hero-2.png, ...).
  --model ID      default: imagen-4.0-fast-generate-001
                  images: imagen-4.0-generate-001 | imagen-4.0-ultra-generate-001 |
                          imagen-4.0-fast-generate-001 | nano-banana-pro-preview |
                          gemini-3-pro-image | gemini-3.1-flash-image
  --aspect RATIO  16:9 (default) | 1:1 | 9:16 | 4:3 | 3:4   (Imagen only)
  --count N       number of images, Imagen only (default 1)
  --backend B     auto (default) | vertex | gemini
  --project ID    GCP project (Vertex)
  --region R      Vertex region (default us-central1)

Auth: vertex -> gcloud access token (draws GCP credits); gemini -> $GEMINI_API_KEY.
NOTE: Imagen 4 is scheduled to retire 2026-08-17 — prefer the Nano Banana lineage for
new work.
"""
import argparse
import base64
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _genmedia_common as g  # noqa: E402


def is_predict_model(model):
    return model.startswith("imagen")


def out_name(base, idx, total):
    if total == 1:
        return base
    root, ext = os.path.splitext(base)
    return f"{root}-{idx+1}{ext}"


def endpoints(a):
    """Return (url_builder, headers) for the chosen backend."""
    backend = g.resolve_backend(a.backend)
    if backend == "vertex":
        token = g.vertex_token()
        project = a.project or g.vertex_project()
        if not project:
            g.die("no project for vertex (pass --project or set $GENMEDIA_PROJECT)")
        verb = "predict" if is_predict_model(a.model) else "generateContent"
        url = g.vertex_model_url(project, a.region, a.model, verb)
        return backend, url, g.bearer(token)
    verb = "predict" if is_predict_model(a.model) else "generateContent"
    return backend, g.gemini_model_url(a.model, verb), g.apikey_header(g.gemini_key())


def run_predict(a, url, headers):
    body = {"instances": [{"prompt": a.prompt}],
            "parameters": {"sampleCount": a.count, "aspectRatio": a.aspect}}
    st, resp = g.post_json(url, headers, body)
    if st != 200:
        g.die(f"predict failed (HTTP {st}): {resp}")
    preds = resp.get("predictions", [])
    if not preds:
        g.die(f"no predictions: {str(resp)[:400]}")
    saved = []
    for i, p in enumerate(preds):
        b64 = p.get("bytesBase64Encoded") or p.get("image", {}).get("bytesBase64Encoded")
        if not b64:
            continue
        path = out_name(a.out, i, len(preds))
        g.save(path, base64.b64decode(b64))
        saved.append(path)
    return saved


def run_generate_content(a, url, headers):
    # role:"user" is required by Vertex generateContent (the Gemini API is lax).
    body = {"contents": [{"role": "user", "parts": [{"text": a.prompt}]}]}
    st, resp = g.post_json(url, headers, body)
    if st != 200:
        g.die(f"generateContent failed (HTTP {st}): {resp}")
    cand = (resp.get("candidates") or [{}])[0]
    raw, mime = g.first_inline(cand.get("content", {}).get("parts", []))
    if not raw:
        g.die(f"no image part (finishReason={cand.get('finishReason')}): {str(resp)[:400]}")
    path = a.out
    if mime == "image/jpeg" and path.endswith(".png"):
        path = path[:-4] + ".jpg"
    g.save(path, raw)
    return [path]


def main():
    ap = argparse.ArgumentParser(description="Generate image(s) via Imagen / Nano Banana.")
    ap.add_argument("prompt")
    ap.add_argument("--out", default="image.png")
    ap.add_argument("--model", default="imagen-4.0-fast-generate-001")
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--backend", default="auto")
    ap.add_argument("--project", default=None)
    ap.add_argument("--region", default=g.vertex_region())
    a = ap.parse_args()

    backend, url, headers = endpoints(a)
    g.log(f"backend={backend} model={a.model}")
    t = time.time()
    saved = run_predict(a, url, headers) if is_predict_model(a.model) \
        else run_generate_content(a, url, headers)
    if not saved:
        g.die("nothing saved")
    for p in saved:
        g.log(f"OK -> {p}")
    g.log(f"done in {time.time()-t:.1f}s (backend={backend})")
    print("\n".join(saved))


if __name__ == "__main__":
    main()
