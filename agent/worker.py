#!/usr/bin/env python3
"""LaunchReel render worker — one instance per parallel lane.

Claims jobs atomically from Convex (claim = transactional mutation, so N
workers never collide), walks the pipeline stages, and reports status after
each stage. Scale lanes with:  docker compose up -d --scale worker=4

Env:
  CONVEX_SITE_URL   https://<name>.convex.site   (required)
  WORKER_KEY        shared secret matching the Convex deployment env (required)
  WORKER_ID         label for traces (default: hostname)
  POLL_SECONDS      idle poll interval (default 5)

Pipeline hooks: each stage shells out to the corresponding skill script so the
generation stack stays swappable (see skills/ in this repo). Stages that are
not yet wired log-and-pass so the claim/status plumbing can be exercised
end-to-end before the render blocks land.
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

BASE = os.environ.get("CONVEX_SITE_URL", "").rstrip("/")
KEY = os.environ.get("WORKER_KEY", "")
WORKER_ID = os.environ.get("WORKER_ID") or socket.gethostname()
POLL = float(os.environ.get("POLL_SECONDS", "5"))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def api(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Worker-Key": KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def set_status(job_id: str, status: str, **extra) -> None:
    api("/api/worker/update", {"jobId": job_id, "status": status, **extra})
    log(job_id, f"status -> {status}")


def log(job_id: str, msg: str) -> None:
    print(f"[{WORKER_ID}] {job_id[-6:] if job_id else '------'} {msg}", flush=True)


def run_stage(job: dict, stage: str, cmd: list[str] | None) -> None:
    """Run a stage's skill script if wired; log-and-pass otherwise."""
    if not cmd:
        log(job["jobId"], f"{stage}: not wired yet (pass-through)")
        time.sleep(1)
        return
    log(job["jobId"], f"{stage}: {' '.join(cmd[:3])}…")
    subprocess.run(cmd, check=True, cwd=REPO, timeout=1800)


def process(job: dict) -> None:
    jid = job["jobId"]
    log(jid, f"claimed: {job['productName']} ({job['tier']})")

    # research (claim already set it) — brand/asset extraction via Linkup + uploads
    run_stage(job, "research", None)

    set_status(jid, "storyboard")  # creative brief -> storyboard.json (fixed schema)
    run_stage(job, "storyboard", None)

    set_status(jid, "voiceover")  # VO via ElevenLabs (coupon) / gpt-4o-mini-tts fallback
    run_stage(job, "voiceover", None)

    set_status(jid, "rendering")  # Remotion comp + optional keyframe-pair Veo b-roll
    run_stage(job, "rendering", None)

    set_status(jid, "awaiting_approval")  # human gate: builder taps approve
    log(jid, "waiting at approval gate — gateway/operator advances to delivered")


def main() -> None:
    if not BASE or not KEY:
        sys.exit("CONVEX_SITE_URL and WORKER_KEY are required")
    log("", f"worker up (poll {POLL}s) -> {BASE}")
    while True:
        try:
            job = api("/api/worker/claim", {"workerId": WORKER_ID}).get("job")
            if not job:
                time.sleep(POLL)
                continue
            try:
                process(job)
            except Exception as e:  # noqa: BLE001 — fail the job, keep the worker alive
                log(job["jobId"], f"FAILED: {e}")
                set_status(job["jobId"], "failed")
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 — transient API errors: back off, retry
            log("", f"poll error: {e}")
            time.sleep(min(POLL * 4, 30))


if __name__ == "__main__":
    main()
