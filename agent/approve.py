#!/usr/bin/env python3
"""approve.py — the operator's approval tap at the human gate.

A trailer sits at `awaiting_approval` with its videoUrl/posterUrl already stamped
(so the operator can watch it). This flips the decision:

  python3 agent/approve.py <jobId>            # approve -> delivered + send `delivered` email
  python3 agent/approve.py <jobId> --revise   # request the one allowed revision (recut)

Approve path:
  1. Fetch the job (email + videoUrl + posterUrl + tier + productName).
     Prefers the guarded /api/worker/job endpoint; if that isn't deployed yet,
     falls back to the public /api/job/status for the URLs and a --email flag for
     the recipient.
  2. POST /api/worker/update -> status "delivered".
  3. Send the `delivered` email via skills/email-channel/scripts/send-email.ts.

Revise path (--revise): per AGENTS.md, one revision per customer. Re-render is
manual today, so this flips the job back to "storyboard" (a recut signal) and
logs it; no delivery email is sent.

Env: CONVEX_SITE_URL, WORKER_KEY, RESEND_API_KEY (for the send). Reads .env/.env.local.
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


def log(msg: str) -> None:
    print(f"[approve] {msg}", flush=True)


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


def api_post(base: str, path: str, body: dict, key: str | None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-Worker-Key"] = key
    req = urllib.request.Request(base.rstrip("/") + path, data=json.dumps(body).encode(),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:  # noqa: BLE001
            return e.code, {}
    except (urllib.error.URLError, OSError, ValueError) as e:
        log(f"POST {path} failed: {e}")
        return 0, {}


def fetch_job(base: str, key: str, job_id: str) -> dict | None:
    """Prefer the guarded worker endpoint (has email); fall back to public status."""
    status, payload = api_post(base, "/api/worker/job", {"jobId": job_id}, key)
    if status == 200 and payload.get("job"):
        job = payload["job"]
        job["_source"] = "worker/job"
        return job
    if status in (404, 401, 0) and payload.get("error") != "unknown job":
        log(f"/api/worker/job unavailable (status {status}: {payload.get('error')}); "
            "trying public /api/job/status (no email — use --email)")
    status, payload = api_post(base, "/api/job/status", {"jobId": job_id}, None)
    if status == 200 and payload.get("job"):
        job = dict(payload["job"])
        job["_source"] = "job/status"
        job["email"] = None  # public endpoint never returns email
        return job
    return None


def send_delivered_email(to: str, data: dict) -> bool:
    runtime = "bun" if shutil.which("bun") else ("node" if shutil.which("node") else None)
    script = os.path.join(REPO, "skills", "email-channel", "scripts", "send-email.ts")
    if not runtime or not os.path.exists(script):
        log(f"delivered email skipped (runtime={runtime}, script exists={os.path.exists(script)})")
        return False
    argv = ([runtime, "run", script] if runtime == "bun" else [runtime, script]) + [
        "--to", to, "--template", "delivered", "--data", json.dumps(data),
    ]
    log(f"delivered email -> {to}")
    r = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        log(f"delivered email FAILED: {r.stderr.strip()[:300] or r.stdout.strip()[:300]}")
        return False
    log(f"delivered email sent: {r.stdout.strip()[:200]}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel approval gate")
    ap.add_argument("job_id")
    ap.add_argument("--revise", action="store_true", help="request the one allowed revision (recut) instead of delivering")
    ap.add_argument("--email", default=None, help="recipient override (used when /api/worker/job is not deployed)")
    ap.add_argument("--dry-run-email", action="store_true", help="render the delivered email but do not send")
    args = ap.parse_args()

    base = load_env("CONVEX_SITE_URL")
    key = load_env("WORKER_KEY")
    if not base or not key:
        log("ERROR: CONVEX_SITE_URL and WORKER_KEY are required")
        return 1

    job = fetch_job(base, key, args.job_id)
    if job is None:
        log(f"ERROR: could not fetch job {args.job_id}")
        return 1
    log(f"job {args.job_id}: status={job.get('status')} product={job.get('productName')!r} "
        f"tier={job.get('tier')} (via {job.get('_source')})")

    if args.revise:
        status, payload = api_post(base, "/api/worker/update",
                                   {"jobId": args.job_id, "status": "storyboard"}, key)
        if status != 200 or not payload.get("ok"):
            log(f"ERROR: revise status update failed (status {status}: {payload})")
            return 1
        log("revision requested -> status 'storyboard'. Re-render is manual today: "
            "re-run storyboard.py -> voiceover.py -> render.sh -> deliver.py for this jobId.")
        print(json.dumps({"jobId": args.job_id, "action": "revise", "status": "storyboard"}))
        return 0

    # Approve -> delivered.
    status, payload = api_post(base, "/api/worker/update",
                               {"jobId": args.job_id, "status": "delivered"}, key)
    if status != 200 or not payload.get("ok"):
        log(f"ERROR: delivered status update failed (status {status}: {payload})")
        return 1
    log("status -> delivered")

    to = job.get("email") or args.email
    web = load_env("WEB_BASE_URL") or "https://launchreel.pages.dev"
    email_data = {
        "productName": job.get("productName"),
        "tier": job.get("tier"),
        "jobId": args.job_id,
        "videoUrl": job.get("videoUrl"),
        "posterUrl": job.get("posterUrl"),
        "dashboardUrl": web.rstrip("/"),
    }
    emailed = False
    if args.dry_run_email:
        log("dry-run-email: not sending")
    elif to:
        emailed = send_delivered_email(to, email_data)
    else:
        log("no recipient email (guarded endpoint not deployed and no --email) — "
            "status flipped to delivered but delivery email not sent")

    # LEARN: delivery is a job close — distill durable preferences into the dossier
    # (email + company) from whatever interaction history the bundle holds. Best-effort.
    try:
        sys.path.insert(0, os.path.join(REPO, "agent"))
        import preferences as _prefs
        bb: dict = {}
        bp = os.path.join(REPO, ".tmp", "scout", args.job_id, "brief.json")
        if os.path.exists(bp):
            with open(bp, encoding="utf-8") as fh:
                bb = json.load(fh)
        _prefs.distill_and_store(to, job.get("productName"), {
            "product": job.get("productName"),
            "brandTone": bb.get("tone"),
            "customerNotes": bb.get("customerNotes"),
            "feedbackNotes": bb.get("feedbackNotes"),
        })
    except Exception as e:  # noqa: BLE001 — never fail the approval on a dossier write
        log(f"preference distill skipped: {e}")

    print(json.dumps({"jobId": args.job_id, "action": "approve", "status": "delivered",
                      "emailedTo": to if emailed else None, "emailSent": emailed}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
