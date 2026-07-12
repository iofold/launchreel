#!/usr/bin/env python3
"""Generate a video clip with Google Veo (Vertex AI preferred, Gemini API fallback).

Veo runs as a long-running operation (LRO): you POST predictLongRunning, then poll
until done, then download the MP4. This script handles the whole loop.

Usage:
  veo-generate.py "PROMPT" --out clip.mp4 [options]

Options:
  --out PATH          output mp4 (default: veo-clip.mp4)
  --model ID          default: veo-3.1-fast-generate-001 (vertex) /
                      veo-3.1-fast-generate-preview (gemini). NOTE the id schemes differ:
                        vertex (GA):  veo-3.1-generate-001 | veo-3.1-fast-generate-001 |
                                      veo-3.1-lite-generate-001 (also veo-3.0-* / veo-2.0-*)
                        gemini API:   veo-3.1-generate-preview | veo-3.1-fast-generate-preview |
                                      veo-3.1-lite-generate-preview
  --aspect RATIO      16:9 (default) | 9:16
  --resolution RES    720p (default) | 1080p
  --duration SECONDS  Vertex honors 4-8; the Gemini API ignores it (fixed 8s w/ audio)
  --backend B         auto (default) | vertex | gemini
  --project ID        GCP project (Vertex). Falls back to $GENMEDIA_PROJECT / gcloud config.
  --region R          Vertex region (default us-central1 / $GENMEDIA_REGION)
  --poll SECONDS      poll interval (default 10)
  --timeout SECONDS   give up after this (default 600)

Auth: vertex -> `gcloud auth print-access-token` (needs cloud-platform scope, draws
GCP credits); gemini -> $GEMINI_API_KEY (billed to the Gemini account, NOT credits).
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _genmedia_common as g  # noqa: E402


def build_params(a):
    p = {"aspectRatio": a.aspect, "resolution": a.resolution, "sampleCount": 1}
    if a.duration:
        p["durationSeconds"] = a.duration
    return p


def run_gemini(a):
    key = g.gemini_key()
    headers = g.apikey_header(key)
    body = {"instances": [{"prompt": a.prompt}], "parameters": build_params(a)}
    url = g.gemini_model_url(a.model, "predictLongRunning")
    st, resp = g.post_json(url, headers, body)
    if st != 200 or "name" not in resp:
        g.die(f"launch failed (HTTP {st}): {resp}")
    op = resp["name"]
    g.log(f"[gemini] operation: {op}")
    deadline = time.time() + a.timeout
    while True:
        st, poll = g.get_json(f"{g.GEMINI_HOST}/{op}", headers)
        if poll.get("done"):
            if poll.get("error"):
                g.die(f"operation error: {poll['error']}")
            break
        if time.time() > deadline:
            g.die("timed out waiting for Veo operation")
        time.sleep(a.poll)
    samples = (poll.get("response", {}).get("generateVideoResponse", {})
               .get("generatedSamples")
               or poll.get("response", {}).get("generateVideoResponse", {})
               .get("generated_samples") or [])
    if not samples:
        g.die(f"no video in response: {str(poll)[:400]}")
    v = samples[0].get("video", {})
    if v.get("uri"):
        st, raw = g.get_bytes(v["uri"], headers)
        if st != 200:
            g.die(f"download failed HTTP {st}")
        return raw
    if v.get("videoBytes") or v.get("video_bytes"):
        import base64
        return base64.b64decode(v.get("videoBytes") or v.get("video_bytes"))
    g.die(f"unrecognized video part: {list(v.keys())}")


def run_vertex(a):
    token = g.vertex_token()
    project = a.project or g.vertex_project()
    if not project:
        g.die("no project for vertex (pass --project or set $GENMEDIA_PROJECT)")
    region = a.region
    headers = g.bearer(token)
    body = {"instances": [{"prompt": a.prompt}], "parameters": build_params(a)}
    url = g.vertex_model_url(project, region, a.model, "predictLongRunning")
    st, resp = g.post_json(url, headers, body)
    if st != 200 or "name" not in resp:
        g.die(f"launch failed (HTTP {st}): {resp}")
    op = resp["name"]
    g.log(f"[vertex] operation: {op}")
    fetch_url = g.vertex_model_url(project, region, a.model, "fetchPredictOperation")
    deadline = time.time() + a.timeout
    while True:
        st, poll = g.post_json(fetch_url, headers, {"operationName": op})
        if poll.get("done"):
            if poll.get("error"):
                g.die(f"operation error: {poll['error']}")
            break
        if time.time() > deadline:
            g.die("timed out waiting for Veo operation")
        time.sleep(a.poll)
    vids = (poll.get("response", {}).get("videos")
            or poll.get("response", {}).get("generatedSamples") or [])
    if not vids:
        g.die(f"no video in response: {str(poll)[:400]}")
    v0 = vids[0]
    if v0.get("bytesBase64Encoded"):
        import base64
        return base64.b64decode(v0["bytesBase64Encoded"])
    if v0.get("gcsUri"):
        g.die(f"video written to GCS: {v0['gcsUri']} (download with gsutil)")
    if v0.get("video", {}).get("uri"):
        st, raw = g.get_bytes(v0["video"]["uri"], headers)
        return raw
    g.die(f"unrecognized video part: {v0}")


def main():
    ap = argparse.ArgumentParser(description="Generate a Veo video (Vertex/Gemini).")
    ap.add_argument("prompt")
    ap.add_argument("--out", default="veo-clip.mp4")
    # default resolved per-backend below: Vertex uses GA "-001" ids, the Gemini
    # API uses "-preview" ids for the same models.
    ap.add_argument("--model", default=None)
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--resolution", default="720p")
    ap.add_argument("--duration", type=int, default=0)
    ap.add_argument("--backend", default="auto")
    ap.add_argument("--project", default=None)
    ap.add_argument("--region", default=g.vertex_region())
    ap.add_argument("--poll", type=int, default=10)
    ap.add_argument("--timeout", type=int, default=600)
    a = ap.parse_args()

    backend = g.resolve_backend(a.backend)
    if not a.model:
        a.model = ("veo-3.1-fast-generate-001" if backend == "vertex"
                   else "veo-3.1-fast-generate-preview")
    g.log(f"backend={backend} model={a.model} out={a.out}")
    t = time.time()
    raw = run_vertex(a) if backend == "vertex" else run_gemini(a)
    n = g.save(a.out, raw)
    g.log(f"OK {n} bytes -> {a.out} in {time.time()-t:.1f}s (backend={backend})")
    print(a.out)


if __name__ == "__main__":
    main()
