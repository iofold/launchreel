#!/usr/bin/env python3
"""LaunchReel render worker — one instance per parallel lane.

Claims jobs atomically from Convex (claim = transactional mutation, so N
workers never collide), walks the pipeline stages, and reports status after
each stage. Scale lanes with:  docker compose up -d --scale worker=4

Env:
  CONVEX_SITE_URL   https://<name>.convex.site   (required)
  WORKER_KEY        shared secret matching the Convex deployment env (required)
  LINKUP_API_KEY    for the Scout research stage (or place it in repo .env;
                    scout.py auto-loads .env/.env.local). Without it, url jobs
                    log the Scout failure and pass through.
  WORKER_ID         label for traces (default: hostname)
  POLL_SECONDS      idle poll interval (default 5)

Pipeline hooks: each stage shells out to the corresponding skill script so the
generation stack stays swappable (see skills/ in this repo). Stages that are
not yet wired log-and-pass so the claim/status plumbing can be exercised
end-to-end before the render blocks land.
"""
import json
import os
import shutil
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


def _email_runtime() -> str | None:
    """Runtime for the (TypeScript) send script: bun if present, else node.
    Node >= 22.18 strips types natively, and the worker image ships node 22 — so
    no bun is required in the container."""
    if shutil.which("bun"):
        return "bun"
    if shutil.which("node"):
        return "node"
    return None


def send_email(to: str, template: str, data: dict) -> None:
    """Transactional email via the email-channel skill (Resend), single source of
    truth for templates in skills/email-channel/scripts/send-email.ts. Best-effort:
    an email failure logs and returns — it must never fail a render job."""
    if not to:
        return
    runtime = _email_runtime()
    script = os.path.join(REPO, "skills", "email-channel", "scripts", "send-email.ts")
    if not runtime or not os.path.exists(script):
        log("", f"email {template} -> {to}: skipped (runtime/script unavailable)")
        return
    argv = ([runtime, "run", script] if runtime == "bun" else [runtime, script]) + [
        "--to", to, "--template", template, "--data", json.dumps(data),
    ]
    try:
        subprocess.run(argv, check=True, cwd=REPO, timeout=60, capture_output=True)
        log("", f"email {template} -> {to}")
    except Exception as e:  # noqa: BLE001 — email is best-effort
        err = getattr(e, "stderr", None)
        detail = err.decode()[:200] if isinstance(err, (bytes, bytearray)) else str(e)
        log("", f"email {template} -> {to} FAILED: {detail}")


def notify(job: dict, template: str) -> None:
    """Customer-facing email for a job stage. Skips seeded/unclaimed jobs — they
    have no owner email (a seeded trailer isn't a customer contact until claimed)."""
    to = job.get("email")
    if not to:
        return
    web = os.environ.get("WEB_BASE_URL", "https://launchreel.pages.dev").rstrip("/")
    data = {
        "productName": job.get("productName"),
        "tier": job.get("tier"),
        "jobId": job.get("jobId"),
        "dashboardUrl": web,
    }
    if template == "delivered":
        data["videoUrl"] = job.get("videoUrl")
        data["posterUrl"] = job.get("posterUrl")
    send_email(to, template, data)


def stage_research(job: dict) -> None:
    """URL-first intake: run Scout on the job's url, then attach the brief.

    Best-effort — a Scout failure logs and passes so the pipeline keeps moving
    (the storyboard stage falls back to productName/oneLiner). Jobs with no url
    keep the original log-and-pass behavior.
    """
    jid = job["jobId"]
    url = job.get("url")
    if not url:
        log(jid, "research: no url — pass-through")
        time.sleep(1)
        return

    out_dir = os.path.join(REPO, ".tmp", "scout", jid)
    os.makedirs(out_dir, exist_ok=True)
    scout = os.path.join(REPO, "skills", "url-intake", "scripts", "scout.py")
    log(jid, f"research: scout {url}")
    try:
        subprocess.run(
            [sys.executable, scout, "--url", url, "--out-dir", out_dir, "--session", f"scout-{jid[-8:]}"],
            check=True, cwd=REPO, timeout=300,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log(jid, f"research: scout failed ({e}); passing through")
        return

    brief_path = os.path.join(out_dir, "brief.json")
    if not os.path.exists(brief_path):
        log(jid, "research: no brief.json produced; passing through")
        return
    try:
        with open(brief_path, encoding="utf-8") as fh:
            brief = json.load(fh)
        api("/api/worker/brief", {"jobId": jid, "brief": brief})
        log(jid, f"research: brief attached ({brief.get('productName')!r})")
    except Exception as e:  # noqa: BLE001 — attaching brief is best-effort
        log(jid, f"research: brief attach failed ({e}); continuing")


def process(job: dict) -> None:
    jid = job["jobId"]
    log(jid, f"claimed: {job['productName']} ({job['tier']})")

    # Order-confirmation email — email is the primary channel. Best-effort; seeded
    # jobs have no owner email and are skipped inside notify().
    notify(job, "order_confirmation")

    # research (claim already set it) — Scout: Linkup fetch/search + screenshots
    stage_research(job)

    set_status(jid, "storyboard")  # creative brief -> storyboard.json (fixed schema)
    run_stage(job, "storyboard", None)

    set_status(jid, "voiceover")  # VO via ElevenLabs (coupon) / gpt-4o-mini-tts fallback
    run_stage(job, "voiceover", None)

    set_status(jid, "rendering")  # Remotion comp + optional keyframe-pair Veo b-roll
    run_stage(job, "rendering", None)

    set_status(jid, "awaiting_approval")  # human gate: builder taps approve
    log(jid, "waiting at approval gate — gateway/operator advances to delivered")
    # On approval -> delivered, send the delivery email. Kept commented until the
    # approval flow exists and stamps videoUrl/posterUrl on the job:
    #   notify({**job, "videoUrl": <url>, "posterUrl": <url>}, "delivered")


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
