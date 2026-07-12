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
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

import feedback  # autonomous email revision loop (checked between claim polls)
import fixpass  # rubric-driven auto-fix pass for a rig-failed render
import profiles  # email-keyed per-customer profile (best-effort; never fails a job)
import storyboard as sb_mod  # available_screenshots + read_json for the fix pass

try:
    import intake_gate  # thin-intake clarifying-questions gate
    _INTAKE_GATE = True
except Exception:  # noqa: BLE001 — a broken gate module must never take down the worker
    intake_gate = None
    _INTAKE_GATE = False

BASE = os.environ.get("CONVEX_SITE_URL", "").rstrip("/")
KEY = os.environ.get("WORKER_KEY", "")
WORKER_ID = os.environ.get("WORKER_ID") or socket.gethostname()
POLL = float(os.environ.get("POLL_SECONDS", "5"))
# Max render attempts per claim: attempt 1, then (on a rig AUTO-FAIL) ONE
# rubric-driven auto-fix + re-render. A second fail escalates to a human.
MAX_RENDER_ATTEMPTS = int(os.environ.get("MAX_RENDER_ATTEMPTS", "2"))
# How often an idle worker checks the revision inbox. Only runs when the render
# queue is empty (between claim polls), so a revision render never overlaps a
# pipeline render in this lane — that overlap is what OOM'd the box before.
INBOX_EVERY = float(os.environ.get("INBOX_EVERY_SECONDS", "30"))
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
        "dashboardUrl": f"{web}/#job={job.get('jobId')}",  # resumable live-status permalink
    }
    if template == "delivered":
        data["videoUrl"] = job.get("videoUrl")
        data["posterUrl"] = job.get("posterUrl")
    send_email(to, template, data)


def record_profile(job: dict, status: str) -> None:
    """Best-effort per-customer profile write, keyed by owner email. Gives a
    returning customer continuity (brand brief, tier + job history, tone). Seeded
    jobs have no owner email and are skipped. Never raises — a profile write must
    never fail a render job."""
    try:
        email = job.get("email")
        if not email:
            return  # seeded/unclaimed job — no customer identity yet
        prof = profiles.read_profile(email)
        jid = job.get("jobId")
        jobs = [j for j in (prof.get("jobs") or []) if j.get("jobId") != jid]
        jobs.append({"jobId": jid, "productName": job.get("productName"),
                     "tier": job.get("tier"), "status": status})
        patch = {"jobs": jobs, "productName": job.get("productName"),
                 "tier": job.get("tier"), "lastStatus": status}
        brief = job.get("brief")
        if isinstance(brief, dict) and brief:
            patch["brandBrief"] = brief
            if brief.get("brandAdjectives"):
                patch["brandAdjectives"] = brief["brandAdjectives"]
            if brief.get("tone"):
                patch["tone"] = brief["tone"]
        profiles.update_profile(email, patch)
        log(job.get("jobId", ""), f"profile: {email} -> {status}")
    except Exception as e:  # noqa: BLE001 — profile write is best-effort
        log(job.get("jobId", ""), f"profile update skipped: {e}")


def _send_need_info(job: dict, questions: list[str]) -> None:
    """Ask the customer for the specifics a thin intake is missing (best-effort).
    Seeded jobs have no owner email and are skipped."""
    to = job.get("email")
    if not to:
        return
    web = os.environ.get("WEB_BASE_URL", "https://launchreel.pages.dev").rstrip("/")
    send_email(to, "need_info", {
        "productName": job.get("productName"),
        "questions": questions,
        "jobId": job.get("jobId"),
        "dashboardUrl": f"{web}/#job={job.get('jobId')}",
    })


def _send_preview_ready(job: dict, video_url: str | None, poster_url: str | None) -> None:
    """The cut is rendered and at the approval gate — email the owner a preview with a
    watch link + poster and invite a pre-delivery tweak. Best-effort; skips seeded
    jobs (no owner) and jobs with no video URL yet."""
    to = job.get("email")
    if not to or not video_url:
        return
    web = os.environ.get("WEB_BASE_URL", "https://launchreel.pages.dev").rstrip("/")
    try:
        send_email(to, "preview_ready", {
            "productName": job.get("productName"),
            "tier": job.get("tier"),
            "videoUrl": video_url,
            "posterUrl": poster_url,
            "dashboardUrl": f"{web}/#job={job.get('jobId')}",
        })
    except Exception as e:  # noqa: BLE001 — preview email must never fail a delivery
        log(job.get("jobId", ""), f"preview_ready email skipped: {e}")


def _send_storyline(job: dict, storyboard_path: str, vo_txt: str) -> None:
    """After the storyboard is written, show the customer the cut we're about to make
    and invite tweaks. The pipeline does NOT wait — a reply re-queues the job via
    feedback.py. Skips seeded jobs (no owner). Best-effort; never fails a render."""
    to = job.get("email")
    if not to:
        return
    sb = _read_json(storyboard_path) or {}
    scenes = [{"type": s.get("type"), "headline": (s.get("headline") or s.get("sub") or "")}
              for s in (sb.get("scenes") or []) if isinstance(s, dict)]
    vo_open = ""
    try:
        if os.path.exists(vo_txt):
            with open(vo_txt, encoding="utf-8") as fh:
                txt = fh.read().strip()
            if txt:
                vo_open = re.split(r"(?<=[.!?])\s+", txt)[0][:200]
    except OSError:
        pass
    web = os.environ.get("WEB_BASE_URL", "https://launchreel.pages.dev").rstrip("/")
    send_email(to, "storyline", {
        "productName": job.get("productName"),
        "tier": job.get("tier"),
        "scenes": scenes,
        "voOpening": vo_open,
        "dashboardUrl": f"{web}/#job={job.get('jobId')}",
    })


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


def render_trailer(job: dict, bundle_dir: str, storyboard_path: str, slug: str) -> tuple[str, str]:
    """One deterministic render. render.sh -> trailer.mp4 + poster.png. Returns
    (mp4, poster); raises if no mp4 lands."""
    jid = job["jobId"]
    out_dir = os.path.join(REPO, "render", "out", slug)
    r = run_capture(jid, "render",
                    [RENDER_SH, "--storyboard", storyboard_path, "--assets", bundle_dir,
                     "--out", out_dir, "--slug", slug], timeout=1800)
    summary = last_json(r.stdout)
    mp4 = summary.get("mp4") or os.path.join(out_dir, "trailer.mp4")
    poster = summary.get("poster") or os.path.join(out_dir, "poster.png")
    log(jid, f"render: {summary.get('renderSec','?')}s, {summary.get('mb','?')}MB, "
             f"{summary.get('durationSec','?')}s trailer ({slug})")
    if not os.path.exists(mp4):
        raise RuntimeError(f"render produced no mp4 at {mp4}")
    return mp4, poster


def deliver_trailer(job: dict, mp4: str, poster: str, attempts: int, fix_note: str | None) -> None:
    """R2 upload + status -> awaiting_approval with videoUrl/posterUrl. Notes how
    many render attempts it took (and the auto-fix, if any) in the deliver log."""
    jid = job["jobId"]
    prov = f"attempt {attempts}/{MAX_RENDER_ATTEMPTS}" + (f", auto-fixed: {fix_note}" if fix_note else "")
    log(jid, f"deliver: shipping the {('auto-fixed ' if fix_note else '')}cut ({prov})")
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
    record_profile(job, "awaiting_approval")
    # Preview email: the cut is rendered + at the approval gate. Show the customer
    # their trailer and invite a pre-delivery tweak (the awaiting_approval status is
    # the pre-delivery feedback path). Best-effort; skips seeded jobs.
    _send_preview_ready(job, delivered.get("videoUrl"), delivered.get("posterUrl"))
    log(jid, "at approval gate — operator runs agent/approve.py to deliver")


def preserve_attempt(bundle_dir: str, storyboard_path: str, scorecard_path: str, n: int) -> None:
    """Freeze attempt-N's storyboard + scorecard next to the bundle as
    rubric-iteration receipts (so a judge can diff attempt-1 vs attempt-2)."""
    for src, tag in ((storyboard_path, "storyboard"), (scorecard_path, "scorecard")):
        if os.path.exists(src):
            dst = os.path.join(bundle_dir, f"{tag}.attempt{n}.json")
            try:
                shutil.copy2(src, dst)
                log("", f"receipt saved: {os.path.basename(dst)}")
            except OSError as e:
                log("", f"could not save {tag} receipt: {e}")


def run_fix_pass(job: dict, bundle_dir: str, storyboard_path: str,
                 scorecard_path: str) -> tuple[dict | None, str]:
    """Feed the rig scorecard + current storyboard to the LLM fix pass; return
    (revised_storyboard, what_changed) or (None, reason). Best-effort: any error
    returns None so the caller escalates to a human rather than shipping."""
    jid = job["jobId"]
    scorecard = _read_json(scorecard_path) or {}
    original = _read_json(storyboard_path) or {}
    if not scorecard or not original:
        return None, "missing scorecard or storyboard for fix pass"
    manifest = sb_mod.read_json(os.path.join(bundle_dir, "manifest.json"))
    screenshots = sb_mod.available_screenshots(bundle_dir, manifest)
    tier = "teaser" if job.get("tier") == "teaser" else "trailer"
    log(jid, f"auto-fix: feeding rig evidence (failing: {fixpass.failing_dims(scorecard) or '—'}) to fix pass")
    try:
        revised, what, _meta = fixpass.fix_from_scorecard(
            original, scorecard, screenshots, tier)
    except Exception as e:  # noqa: BLE001 — fix pass is best-effort
        return None, f"fix pass error: {e}"
    return revised, what


def stage_render_and_deliver(job: dict, bundle_dir: str, storyboard_path: str) -> None:
    """Render -> vision rig -> (on AUTO-FAIL) one rubric-driven auto-fix + re-render
    -> deliver, bounded to MAX_RENDER_ATTEMPTS renders.

    Attempt 1: render + rig. A non-fail verdict (pass/needs_human) delivers as usual
    (pass/needs_human still goes to the human approval gate downstream). A rig
    AUTO-FAIL feeds the scorecard's per-dimension evidence + the current storyboard
    to the LLM fix pass (fixpass.py), which makes targeted edits addressing ONLY the
    cited defects; we re-render and re-rig. A second AUTO-FAIL (or an unfixable one)
    marks the job failed and sends the honest `quality_hold` email — a human director
    finishes it. Attempt-1's storyboard + scorecard are frozen in the bundle as
    iteration receipts."""
    jid = job["jobId"]
    slug = slug_for(job)
    scorecard_path = os.path.join(bundle_dir, "scorecard.json")

    fix_note: str | None = None
    for attempt in range(1, MAX_RENDER_ATTEMPTS + 1):
        render_slug = slug if attempt == 1 else f"{slug}-fix{attempt - 1}"
        mp4, poster = render_trailer(job, bundle_dir, storyboard_path, render_slug)

        # Vision rig (stills gate) -> writes scorecard_path, returns the verdict.
        verdict = run_vision_rig(job, bundle_dir, storyboard_path, mp4)
        if verdict != "fail":
            log(jid, f"vision rig verdict: {verdict} on attempt {attempt} "
                     f"(pass/needs_human still goes to the human approval gate)")
            deliver_trailer(job, mp4, poster, attempt, fix_note)
            return

        log(jid, f"vision rig AUTO-FAIL on attempt {attempt}/{MAX_RENDER_ATTEMPTS}")
        if attempt >= MAX_RENDER_ATTEMPTS:
            break  # exhausted attempts -> escalate below

        # Freeze the failing attempt's receipts, then auto-fix + re-render.
        preserve_attempt(bundle_dir, storyboard_path, scorecard_path, attempt)
        revised, fix_note = run_fix_pass(job, bundle_dir, storyboard_path, scorecard_path)
        if revised is None:
            log(jid, f"auto-fix produced no valid edit ({fix_note}) — escalating to human")
            set_status(jid, "failed")
            notify(job, "quality_hold")
            return
        log(jid, f"auto-fix applied: {fix_note} — re-rendering (attempt {attempt + 1})")
        with open(storyboard_path, "w", encoding="utf-8") as fh:
            json.dump(revised, fh, indent=2)

    # Fell out of the loop on a final AUTO-FAIL: quality gate holds the cut.
    log(jid, "quality gate held the cut after auto-fix — marking failed + notifying (human polish)")
    set_status(jid, "failed")
    notify(job, "quality_hold")


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
    # jobs have no owner email and are skipped inside notify(). Skip it on a re-queued
    # job (awaiting_info resume / pre-delivery feedback): it already got one, and
    # feedback.py sent a tailored "crew is rolling"/"folding that in" reply.
    brief0 = job.get("brief")
    is_requeue = isinstance(brief0, dict) and bool(brief0.get("customerNotes") or brief0.get("feedbackNotes"))
    if not is_requeue:
        notify(job, "order_confirmation")
    record_profile(job, job.get("status") or "claimed")

    bundle_dir = os.path.join(REPO, ".tmp", "scout", jid)
    os.makedirs(bundle_dir, exist_ok=True)
    storyboard_path = os.path.join(bundle_dir, "storyboard.json")
    vo_txt = os.path.join(bundle_dir, "vo.txt")
    vo_mp3 = os.path.join(bundle_dir, "vo.mp3")

    # research (claim already set it) — Scout: Linkup fetch/search + screenshots
    stage_research(job, bundle_dir)

    # Thin-intake gate: if research gave us too little to make a truthful trailer AND
    # this job has an owner we can ask, park it at awaiting_info with 2-4 specific
    # questions instead of rendering something hollow. Seeded jobs (no email) always
    # render best-effort. Guarded: any gate error falls through to storyboard as today.
    if _INTAKE_GATE and job.get("email"):
        try:
            intake_gate.apply_carryover_notes(job, bundle_dir)  # re-thread a resumed reply
            decision = intake_gate.assess(bundle_dir, job)
        except Exception as e:  # noqa: BLE001 — never let the gate fail a job
            log(jid, f"intake gate error ({e}); proceeding to storyboard")
            decision = {"sufficient": True}
        if not decision.get("sufficient", True):
            log(jid, f"intake insufficient ({'; '.join(decision.get('reasons') or [])}) -> awaiting_info")
            try:
                questions = intake_gate.draft_questions(job, bundle_dir, decision)
            except Exception as e:  # noqa: BLE001
                log(jid, f"draft_questions error ({e}); using fallback")
                questions = intake_gate.fallback_questions(job.get("productName") or "your product")
            _send_need_info(job, questions)
            set_status(jid, "awaiting_info")
            record_profile(job, "awaiting_info")
            return  # lane is never blocked — the customer's reply re-queues the job

    # storyboard — brief + scout bundle -> storyboard.json (validated) + vo.txt
    set_status(jid, "storyboard")
    run_capture(jid, "storyboard", [
        sys.executable, STORYBOARD_PY, "--bundle-dir", bundle_dir,
        "--product-name", job.get("productName") or "", "--one-liner", job.get("oneLiner") or "",
        "--url", job.get("url") or "", "--tier", job.get("tier") or "teaser",
        "--out", storyboard_path, "--vo-out", vo_txt,
        "--meta-out", os.path.join(bundle_dir, "storyboard.meta.json"),
    ], timeout=300)

    # Storyline preview — email the customer the cut we're about to make and invite
    # tweaks. The pipeline does NOT wait; a reply re-queues the job (feedback.py).
    # Best-effort; skips seeded jobs.
    if job.get("email"):
        try:
            _send_storyline(job, storyboard_path, vo_txt)
        except Exception as e:  # noqa: BLE001 — storyline email must never fail a render
            log(jid, f"storyline email skipped: {e}")

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
    log("", f"worker up (poll {POLL}s, inbox {INBOX_EVERY}s) -> {BASE}")
    last_inbox = 0.0
    while True:
        try:
            if not claim_and_process():
                # Queue empty this poll -> nothing rendering in this lane, so it's
                # safe to check the revision inbox (rate-limited to ~INBOX_EVERY).
                now = time.monotonic()
                if now - last_inbox >= INBOX_EVERY:
                    last_inbox = now
                    try:
                        feedback.check_inbox_once(send_email=send_email)
                    except Exception as e:  # noqa: BLE001 — inbox is best-effort
                        log("", f"inbox check error: {e}")
                time.sleep(POLL)
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 — transient API errors: back off, retry
            log("", f"poll error: {e}")
            time.sleep(min(POLL * 4, 30))


if __name__ == "__main__":
    main()
