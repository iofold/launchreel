#!/usr/bin/env python3
"""deliver.py — publish a rendered trailer and open the approval gate.

Uploads trailer.mp4 + poster.png to the public R2 bucket, computes their public
r2.dev URLs, and POSTs /api/worker/update to set the job to `awaiting_approval`
WITH videoUrl + posterUrl. The URLs land on the job BEFORE approval so the human
(or Buildathon TV / dashboard) can watch the cut while it waits at the gate; the
approve step only flips the status.

R2 is public: the bucket `launchreel-renders` has its r2.dev dev URL enabled, so
`<public-base>/<jobId>/trailer.mp4` is directly playable with no signing.

If R2 upload is unavailable on this account, pass --fallback-web to instead copy
the files into web/t/<jobId>/ (served by the Cloudflare Pages app after its next
deploy) and emit those URLs — the worker/operator then knows a Pages redeploy
publishes them.

Usage:
  deliver.py --job-id <id> --mp4 out/<slug>/trailer.mp4 --poster out/<slug>/poster.png \
             [--bucket launchreel-renders] [--public-base https://pub-....r2.dev] \
             [--status awaiting_approval] [--no-convex] [--fallback-web]

Env: CONVEX_SITE_URL, WORKER_KEY (for the Convex update). Reads .env/.env.local.
Exit 0 when uploads + (optional) update succeeded; 1 otherwise.
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
DEFAULT_BUCKET = "launchreel-renders"
# r2.dev dev URL for launchreel-renders (public access enabled 2026-07-12).
DEFAULT_PUBLIC_BASE = "https://pub-2170a2cdfc494c2abdef1950108bba6c.r2.dev"


def log(msg: str) -> None:
    print(f"[deliver] {msg}", flush=True)


def load_env(name: str) -> str:
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


def r2_put(bucket: str, key: str, file_path: str, content_type: str) -> bool:
    cmd = ["npx", "--no-install", "wrangler", "r2", "object", "put",
           f"{bucket}/{key}", "--file", os.path.abspath(file_path),
           "--content-type", content_type, "--remote"]
    log(f"r2 put {bucket}/{key} ({os.path.getsize(file_path)//1024} KB)")
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        log(f"r2 put failed: {r.stderr.strip()[:300] or r.stdout.strip()[:300]}")
        return False
    return True


def convex_update(base: str, key: str, job_id: str, status: str, video_url: str, poster_url: str) -> bool:
    body = {"jobId": job_id, "status": status, "videoUrl": video_url, "posterUrl": poster_url}
    req = urllib.request.Request(
        base.rstrip("/") + "/api/worker/update",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Worker-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            payload = json.load(res)
        if not payload.get("ok"):
            log(f"convex update non-ok: {payload}")
            return False
        return True
    except urllib.error.HTTPError as e:
        log(f"convex update HTTP {e.code}: {e.read().decode()[:200]}")
        return False
    except (urllib.error.URLError, OSError, ValueError) as e:
        log(f"convex update failed: {e}")
        return False


def deliver_web_fallback(job_id: str, mp4: str, poster: str) -> dict:
    """Copy into web/t/<jobId>/ for the Pages app; URLs go live on next deploy."""
    dest = os.path.join(REPO, "web", "t", job_id)
    os.makedirs(dest, exist_ok=True)
    shutil.copy2(mp4, os.path.join(dest, "trailer.mp4"))
    shutil.copy2(poster, os.path.join(dest, "poster.png"))
    web_base = load_env("WEB_BASE_URL") or "https://launchreel.pages.dev"
    return {
        "mode": "web-fallback",
        "videoUrl": f"{web_base.rstrip('/')}/t/{job_id}/trailer.mp4",
        "posterUrl": f"{web_base.rstrip('/')}/t/{job_id}/poster.png",
        "note": "files staged in web/t/<jobId>/ — a Cloudflare Pages redeploy publishes them",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel delivery — R2 upload + approval-gate update")
    ap.add_argument("--job-id", required=True)
    ap.add_argument("--mp4", required=True)
    ap.add_argument("--poster", required=True)
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--public-base", default=os.environ.get("R2_PUBLIC_BASE", DEFAULT_PUBLIC_BASE))
    ap.add_argument("--status", default="awaiting_approval")
    ap.add_argument("--no-convex", action="store_true", help="upload only; skip the Convex status update")
    ap.add_argument("--fallback-web", action="store_true", help="skip R2; stage into web/t/<jobId>/ instead")
    args = ap.parse_args()

    for p in (args.mp4, args.poster):
        if not os.path.exists(p):
            log(f"ERROR: missing artifact: {p}")
            return 1

    if args.fallback_web:
        result = deliver_web_fallback(args.job_id, args.mp4, args.poster)
    else:
        vkey = f"{args.job_id}/trailer.mp4"
        pkey = f"{args.job_id}/poster.png"
        ok = r2_put(args.bucket, vkey, args.mp4, "video/mp4") and \
            r2_put(args.bucket, pkey, args.poster, "image/png")
        if not ok:
            log("R2 upload failed — falling back to web/t/<jobId>/ staging")
            result = deliver_web_fallback(args.job_id, args.mp4, args.poster)
        else:
            base = args.public_base.rstrip("/")
            result = {"mode": "r2", "bucket": args.bucket,
                      "videoUrl": f"{base}/{vkey}", "posterUrl": f"{base}/{pkey}"}

    video_url, poster_url = result["videoUrl"], result["posterUrl"]

    updated = False
    if not args.no_convex:
        base = load_env("CONVEX_SITE_URL")
        key = load_env("WORKER_KEY")
        if not base or not key:
            log("WARN: CONVEX_SITE_URL / WORKER_KEY not set — skipping status update")
        else:
            updated = convex_update(base, key, args.job_id, args.status, video_url, poster_url)
            if updated:
                log(f"convex: job {args.job_id} -> {args.status} (videoUrl/posterUrl stamped)")

    result.update({"jobId": args.job_id, "status": args.status if updated else None,
                   "convexUpdated": updated})
    log(f"video:  {video_url}")
    log(f"poster: {poster_url}")
    print(json.dumps(result))
    # Upload success is the bar; a Convex update failure is reported but not fatal
    # here (the worker/operator can re-issue the status update).
    return 0


if __name__ == "__main__":
    sys.exit(main())
