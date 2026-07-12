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

Pipeline hooks: each stage shells out to a script so the generation stack stays
swappable (see agent/ + skills/ in this repo):
  research   -> skills/url-intake/scripts/scout.py   (brief.json + screenshots)
  storyboard -> agent/storyboard.py                  (storyboard.json + vo.txt)
  voiceover  -> agent/voiceover.py                   (vo.mp3, wires audio.voPath)
  rendering  -> render/scripts/render.sh             (trailer.mp4 + poster.png)
               eval/scripts/frame-qa.py              (vision-rig stills gate)
               agent/deliver.py                      (R2 upload + awaiting_approval)
An auto-fail vision verdict marks the job failed (re-render is manual today).
The approval gate (awaiting_approval -> delivered) is a separate operator tap:
agent/approve.py.
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


AGENT = os.path.join(REPO, "agent")
STORYBOARD_PY = os.path.join(AGENT, "storyboard.py")
VOICEOVER_PY = os.path.join(AGENT, "voiceover.py")
DELIVER_PY = os.path.join(AGENT, "deliver.py")
RENDER_SH = os.path.join(REPO, "render", "scripts", "render.sh")
FRAME_QA_PY = os.path.join(REPO, "eval", "scripts", "frame-qa.py")


def run_capture(job_id: str, label: str, cmd: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    """Run a stage command, streaming a short trace and capturing stdout/stderr.
    Raises CalledProcessError on non-zero exit so process() can fail the job."""
    log(job_id, f"{label}: {os.path.basename(cmd[0])} {' '.join(a for a in cmd[1:4])}…")
    r = subprocess.run(cmd, cwd=REPO, timeout=timeout, capture_output=True, text=True)
    if r.stderr.strip():
        for line in r.stderr.strip().splitlines()[-6:]:
            log(job_id, f"  {label}| {line}")
    if r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, cmd, r.stdout, r.stderr)
    return r


def last_json(text: str) -> dict:
    """Return the LAST top-level JSON object anywhere in stdout — handles both
    compact one-line summaries (storyboard.py, deliver.py) and pretty-printed
    multi-line ones (render.ts uses indent=2)."""
    dec = json.JSONDecoder()
    best: dict = {}
    i, n = 0, len(text)
    while i < n:
        if text[i] == "{":
            try:
                obj, end = dec.raw_decode(text, i)
            except ValueError:
                i += 1
                continue
            if isinstance(obj, dict):
                best = obj
                i = end
                continue
        i += 1
    return best


def slug_for(job: dict) -> str:
    base = (job.get("productName") or "job").lower()
    base = "".join(c if c.isalnum() else "-" for c in base).strip("-") or "job"
    return f"{base}-{job['jobId'][-6:]}"


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


def stage_research(job: dict, out_dir: str) -> None:
    """URL-first intake: run Scout on the job's url into the job bundle dir, then
    attach the brief.

    Best-effort — a Scout failure logs and passes so the pipeline keeps moving
    (the storyboard stage falls back to productName/oneLiner). Jobs with no url
    skip Scout; the bundle dir stays empty and storyboard.py uses the job fields.
    """
    jid = job["jobId"]
    url = job.get("url")
    if not url:
        log(jid, "research: no url — storyboard will use job fields")
        return

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


def stage_render_and_deliver(job: dict, bundle_dir: str, storyboard_path: str) -> None:
    """Render the deterministic trailer, run the vision rig, then deliver.

    render.sh -> trailer.mp4 + poster.png. The vision rig (frame-qa.py) scores the
    stills; an auto-fail verdict marks the job failed (re-render is manual today).
    Otherwise deliver.py uploads to R2 and opens the approval gate."""
    jid = job["jobId"]
    slug = slug_for(job)
    out_dir = os.path.join(REPO, "render", "out", slug)

    r = run_capture(jid, "render",
                    [RENDER_SH, "--storyboard", storyboard_path, "--assets", bundle_dir,
                     "--out", out_dir, "--slug", slug], timeout=1800)
    summary = last_json(r.stdout)
    mp4 = summary.get("mp4") or os.path.join(out_dir, "trailer.mp4")
    poster = summary.get("poster") or os.path.join(out_dir, "poster.png")
    log(jid, f"render: {summary.get('renderSec','?')}s, {summary.get('mb','?')}MB, "
             f"{summary.get('durationSec','?')}s trailer")
    if not os.path.exists(mp4):
        raise RuntimeError(f"render produced no mp4 at {mp4}")

    # Vision rig (stills gate). GEMINI_API_KEY from env / hermes .env default.
    verdict = run_vision_rig(job, bundle_dir, storyboard_path, mp4)
    if verdict == "fail":
        log(jid, "vision rig AUTO-FAIL — marking job failed (re-render is manual today)")
        set_status(jid, "failed")
        return
    log(jid, f"vision rig verdict: {verdict} (advisory — pass/needs_human still goes to human gate)")

    # Deliver: R2 upload + status -> awaiting_approval with videoUrl/posterUrl.
    d = run_capture(jid, "deliver",
                    [sys.executable, DELIVER_PY, "--job-id", jid, "--mp4", mp4, "--poster", poster],
                    timeout=600)
    delivered = last_json(d.stdout)
    log(jid, f"deliver: video={delivered.get('videoUrl')}")
    log(jid, f"deliver: poster={delivered.get('posterUrl')}")
    if not delivered.get("convexUpdated"):
        # deliver.py uploads even if the status update fails — ensure the gate is reached.
        set_status(jid, "awaiting_approval",
                   **{k: delivered[k] for k in ("videoUrl", "posterUrl") if delivered.get(k)})
    log(jid, "at approval gate — operator runs agent/approve.py to deliver")


def run_vision_rig(job: dict, bundle_dir: str, storyboard_path: str, mp4: str) -> str:
    """Run eval/scripts/frame-qa.py and return its deterministic verdict
    (pass|needs_human|fail). Best-effort: a rig failure returns 'needs_human' so a
    human still reviews — it never blocks delivery on its own error."""
    jid = job["jobId"]
    tier = "free" if job.get("tier") == "teaser" else "paid"
    scorecard = os.path.join(bundle_dir, "scorecard.json")
    brand_json = write_brand_json(job, bundle_dir, storyboard_path)
    expect_url = brand_display_url(storyboard_path) or (job.get("url") or "")
    cmd = [sys.executable, FRAME_QA_PY, "--video", mp4, "--out", scorecard,
           "--tier", tier, "--frames", "8"]
    if expect_url:
        cmd += ["--expect-url", expect_url]
    if brand_json:
        cmd += ["--brand-json", brand_json]
    try:
        r = run_capture(jid, "vision", cmd, timeout=300)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log(jid, f"vision rig error ({e}); treating as needs_human")
        return "needs_human"
    card = last_json(r.stdout) if r.stdout.strip().endswith("}") else {}
    if not card:
        card = _read_json(scorecard) or {}
    scores = card.get("scores", {})
    if scores:
        log(jid, "vision scores: " + "  ".join(
            f"{d}={scores[d].get('score')}" for d in scores))
    return card.get("verdict", "needs_human")


def write_brand_json(job: dict, bundle_dir: str, storyboard_path: str) -> str | None:
    """Ground-truth brand for the rig from the storyboard's brand block + brief tone."""
    sb = _read_json(storyboard_path) or {}
    brand = sb.get("brand") or {}
    brief = _read_json(os.path.join(bundle_dir, "brief.json")) or {}
    if not brand:
        return None
    data = {
        "name": brand.get("name") or job.get("productName"),
        "palette": brand.get("colors", {}),
        "url": brand.get("url"),
        "tone": brief.get("tone") or "",
        "brandAdjectives": brief.get("brandAdjectives") or [],
    }
    path = os.path.join(bundle_dir, "brand.json")
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        return path
    except OSError:
        return None


def brand_display_url(storyboard_path: str) -> str:
    sb = _read_json(storyboard_path) or {}
    return ((sb.get("brand") or {}).get("url")) or ""


def _read_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def process(job: dict) -> None:
    jid = job["jobId"]
    log(jid, f"claimed: {job['productName']} ({job['tier']})")

    # Order-confirmation email — email is the primary channel. Best-effort; seeded
    # jobs have no owner email and are skipped inside notify().
    notify(job, "order_confirmation")

    bundle_dir = os.path.join(REPO, ".tmp", "scout", jid)
    os.makedirs(bundle_dir, exist_ok=True)
    storyboard_path = os.path.join(bundle_dir, "storyboard.json")
    vo_txt = os.path.join(bundle_dir, "vo.txt")
    vo_mp3 = os.path.join(bundle_dir, "vo.mp3")

    # research (claim already set it) — Scout: Linkup fetch/search + screenshots
    stage_research(job, bundle_dir)

    # storyboard — brief + scout bundle -> storyboard.json (validated) + vo.txt
    set_status(jid, "storyboard")
    run_capture(jid, "storyboard", [
        sys.executable, STORYBOARD_PY, "--bundle-dir", bundle_dir,
        "--product-name", job.get("productName") or "", "--one-liner", job.get("oneLiner") or "",
        "--url", job.get("url") or "", "--tier", job.get("tier") or "teaser",
        "--out", storyboard_path, "--vo-out", vo_txt,
        "--meta-out", os.path.join(bundle_dir, "storyboard.meta.json"),
    ], timeout=300)

    # voiceover — vo.txt -> vo.mp3 (ElevenLabs, OpenAI fallback); wires audio.voPath.
    # Best-effort: a VO failure logs and continues (trailer renders without narration).
    set_status(jid, "voiceover")
    try:
        run_capture(jid, "voiceover", [
            sys.executable, VOICEOVER_PY, "--vo-txt", vo_txt, "--out", vo_mp3,
            "--storyboard", storyboard_path,
        ], timeout=300)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log(jid, f"voiceover failed ({e}); rendering without narration")

    # rendering -> vision rig -> delivery (ends at awaiting_approval with URLs).
    set_status(jid, "rendering")
    stage_render_and_deliver(job, bundle_dir, storyboard_path)


def claim_and_process() -> bool:
    """Claim one job and run it through the pipeline. Returns True if a job was
    claimed (processed or failed), False if the queue was empty."""
    job = api("/api/worker/claim", {"workerId": WORKER_ID}).get("job")
    if not job:
        return False
    try:
        process(job)
    except Exception as e:  # noqa: BLE001 — fail the job, keep the worker alive
        log(job["jobId"], f"FAILED: {e}")
        set_status(job["jobId"], "failed")
    return True


def main() -> None:
    if not BASE or not KEY:
        sys.exit("CONVEX_SITE_URL and WORKER_KEY are required")
    # Single-shot: claim + process exactly one job then exit (smoke / CI / the
    # `prove it` run). `--once` or WORKER_ONCE=1.
    once = "--once" in sys.argv or os.environ.get("WORKER_ONCE") == "1"
    if once:
        log("", f"worker single-shot -> {BASE}")
        if not claim_and_process():
            log("", "queue empty — nothing to do")
        return
    log("", f"worker up (poll {POLL}s) -> {BASE}")
    while True:
        try:
            if not claim_and_process():
                time.sleep(POLL)
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 — transient API errors: back off, retry
            log("", f"poll error: {e}")
            time.sleep(min(POLL * 4, 30))


if __name__ == "__main__":
    main()
