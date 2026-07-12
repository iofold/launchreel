#!/usr/bin/env python3
"""Generate a Veo 3.1 video by interpolating between a FIRST and a LAST keyframe.

This is the keyframe-pair recipe: you render two still images (the opening and the
closing frame of a shot) and let Veo 3.1 fill the motion in between. It gives you
precise control over composition — the shot starts and ends exactly where you drew
it — which is what makes it usable for branded SaaS motion graphics (a dashboard
that assembles, a metric that counts up, a wordmark that resolves).

Like plain text-to-video, Veo runs as a long-running operation (LRO): POST
predictLongRunning, poll until done, then download the MP4. This script handles the
whole loop for both backends and shares auth/HTTP with the gcp-genmedia skill.

Usage:
  keyframe-video.py --first first.png --last last.png --prompt "PROMPT" \
      --duration 6 --out shot.mp4 [options]

Required:
  --first-image PATH  opening frame (a.k.a. --first / --first-frame)
  --last-image PATH   closing frame (a.k.a. --last / --last-frame)
  --prompt TEXT       motion between the two frames (camera move, what animates)

Options:
  --out PATH          output mp4 (default: keyframe-clip.mp4)
  --model ID          default: veo-3.1-fast-generate-001 (vertex) /
                      veo-3.1-fast-generate-preview (gemini).
                      NOTE: last-frame interpolation needs a Veo 3.1 model that
                      supports "frame-specific generation" — the STANDARD and FAST
                      tiers do; the LITE tier is text/first-frame only. Do not pass a
                      -lite- id here.
  --aspect RATIO      16:9 (default) | 9:16
  --resolution RES    720p (default) | 1080p
  --duration SECONDS  Vertex honors 4-8 (default 6); the Gemini API fixes 8s.
  --backend B         auto (default) | vertex | gemini
  --project ID        GCP project (Vertex). Falls back to $GENMEDIA_PROJECT/gcloud.
  --region R          Vertex region (default us-central1 / $GENMEDIA_REGION)
  --poll SECONDS      poll interval (default 10)
  --timeout SECONDS   give up after this (default 600)

Auth: identical to gcp-genmedia. vertex -> `gcloud auth print-access-token`
(cloud-platform scope, draws GCP credits); gemini -> $GEMINI_API_KEY.
"""
import argparse
import base64
import mimetypes
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _genmedia_common as g  # noqa: E402


def load_frame(path):
    """Read an image and return {'bytesBase64Encoded': ..., 'mimeType': ...}.

    Both Vertex and the Gemini predictLongRunning surface accept a frame as a
    base64 blob with an explicit mimeType. PNG/JPEG both work; we sniff from the
    file so an accidental JPEG named .png still gets the right type.
    """
    with open(path, "rb") as f:
        raw = f.read()
    mime = mimetypes.guess_type(path)[0]
    # sniff magic bytes so a mislabeled extension doesn't send a wrong mimeType
    if raw[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif raw[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        mime = "image/webp"
    mime = mime or "image/png"
    return {"bytesBase64Encoded": base64.b64encode(raw).decode(), "mimeType": mime}, len(raw)


def build_instance(a):
    first, n1 = load_frame(a.first_image)
    last, n2 = load_frame(a.last_image)
    g.log(f"first-frame {n1} B ({first['mimeType']}), last-frame {n2} B ({last['mimeType']})")
    # VERIFIED SHAPE (Vertex, 2026-07-12): first frame -> instances[].image,
    # last frame -> instances[].lastFrame, both {bytesBase64Encoded, mimeType}.
    # This mirrors the SDK (image=<first>, config.last_frame=<last>).
    return {"prompt": a.prompt, "image": first, "lastFrame": last}


def build_params(a):
    p = {"aspectRatio": a.aspect, "resolution": a.resolution, "sampleCount": 1}
    if a.duration:
        p["durationSeconds"] = a.duration
    return p


def run_gemini(a):
    key = g.gemini_key()
    headers = g.apikey_header(key)
    body = {"instances": [build_instance(a)], "parameters": build_params(a)}
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
        return base64.b64decode(v.get("videoBytes") or v.get("video_bytes"))
    g.die(f"unrecognized video part: {list(v.keys())}")


def run_vertex(a):
    token = g.vertex_token()
    project = a.project or g.vertex_project()
    if not project:
        g.die("no project for vertex (pass --project or set $GENMEDIA_PROJECT)")
    region = a.region
    headers = g.bearer(token)
    body = {"instances": [build_instance(a)], "parameters": build_params(a)}
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
        return base64.b64decode(v0["bytesBase64Encoded"])
    if v0.get("gcsUri"):
        g.die(f"video written to GCS: {v0['gcsUri']} (download with gsutil)")
    if v0.get("video", {}).get("uri"):
        st, raw = g.get_bytes(v0["video"]["uri"], headers)
        return raw
    g.die(f"unrecognized video part: {v0}")


def main():
    ap = argparse.ArgumentParser(description="Veo 3.1 first+last keyframe interpolation.")
    ap.add_argument("--first-image", "--first", "--first-frame", dest="first_image", required=True)
    ap.add_argument("--last-image", "--last", "--last-frame", dest="last_image", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", default="keyframe-clip.mp4")
    ap.add_argument("--model", default=None)
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--resolution", default="720p")
    ap.add_argument("--duration", type=int, default=6)
    ap.add_argument("--backend", default="auto")
    ap.add_argument("--project", default=None)
    ap.add_argument("--region", default=g.vertex_region())
    ap.add_argument("--poll", type=int, default=10)
    ap.add_argument("--timeout", type=int, default=600)
    a = ap.parse_args()

    for p in (a.first_image, a.last_image):
        if not os.path.exists(p):
            g.die(f"keyframe not found: {p}")

    backend = g.resolve_backend(a.backend)
    if not a.model:
        a.model = ("veo-3.1-fast-generate-001" if backend == "vertex"
                   else "veo-3.1-fast-generate-preview")
    if "lite" in a.model:
        g.log("WARNING: a -lite- model was requested; the Lite tier does not support "
              "last-frame interpolation and will likely 400/ignore the lastFrame.")
    g.log(f"backend={backend} model={a.model} dur={a.duration}s out={a.out}")
    t = time.time()
    raw = run_vertex(a) if backend == "vertex" else run_gemini(a)
    n = g.save(a.out, raw)
    g.log(f"OK {n} bytes -> {a.out} in {time.time()-t:.1f}s (backend={backend})")
    print(a.out)


if __name__ == "__main__":
    main()
