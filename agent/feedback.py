#!/usr/bin/env python3
"""feedback.py — LaunchReel's autonomous email revision loop.

A customer replies to their trailer email with feedback. This polls Convex for
unprocessed inbound emails (the email_inbound events logged by the Cloudflare
Email Worker), matches each sender to the latest trailer they have a rendered
video for, and applies AT MOST ONE minimal revision:

  * no matching job with a video   -> ack `no_job`         + polite reply email
  * job already revised once (>=1)  -> ack `escalated_human`+ "human on it" email
  * otherwise                       -> an LLM makes a MINIMAL edit to the storyboard
                                       (colors / headlines / subs / quote / metrics
                                       only — never scene order, screenshots, or the
                                       watermark), we re-render the trailer, upload it
                                       to R2 under <jobId>/rev1/, bump revisionCount +
                                       re-deliver, ack `revised`, and email the new cut.

Every branch acks the event so each inbound is handled exactly once. Any
unexpected failure acks `failed` and logs — the loop never crashes.

Reuses the existing pipeline pieces rather than reimplementing them:
  - storyboard.py  : OpenAI caller + schema/semantic validation
  - render/scripts/render.sh : the deterministic Remotion render
  - agent/deliver.py         : R2 upload (here with --no-convex; we re-deliver
                               via the revision endpoint so revisionCount bumps)
  - skills/email-channel/scripts/send-email.ts : the outbound email channel

Modes:
  feedback.py [--once]      drain the inbox once, then exit (default)
  feedback.py --daemon      poll forever (interval --poll, default 30s)

Env: CONVEX_SITE_URL, WORKER_KEY (Convex); OPENAI_API_KEY (LLM edit);
RESEND_API_KEY (email); CLOUDFLARE_API_TOKEN/CF_ACCOUNT_ID (R2, via deliver.py).
Reads .env, .env.local, and ops/hermes/.env as fallbacks.
"""
import argparse
import copy
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENT = os.path.join(REPO, "agent")
if AGENT not in sys.path:
    sys.path.insert(0, AGENT)
import storyboard as sb_mod  # noqa: E402 — reuse OpenAI caller + validation
import compare  # noqa: E402 — two-video comparison handler (checked ahead of revision)

DELIVER_PY = os.path.join(AGENT, "deliver.py")
STORYBOARD_PY = os.path.join(AGENT, "storyboard.py")
RENDER_SH = os.path.join(REPO, "render", "scripts", "render.sh")
STORYBOARD_SCHEMA = os.path.join(REPO, "render", "storyboard.schema.json")
ENV_FILES = (".env", ".env.local", os.path.join("ops", "hermes", ".env"))
DEFAULT_POLL = float(os.environ.get("FEEDBACK_POLL_SECONDS", "30"))
REVISE_MODEL = os.environ.get("FEEDBACK_MODEL", "gpt-5-mini")

# Single-flight across threads in one process (the worker calls this from its
# poll loop; a --daemon run is single-threaded anyway).
_INBOX_LOCK = threading.Lock()


def log(msg: str) -> None:
    print(f"[feedback] {msg}", flush=True)


# --- env / http ------------------------------------------------------------

def load_env(name: str) -> str:
    val = os.environ.get(name)
    if val:
        return val
    for rel in ENV_FILES:
        path = os.path.join(REPO, rel)
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


def api(path: str, body: dict, timeout: int = 30) -> tuple[int, dict]:
    base = load_env("CONVEX_SITE_URL").rstrip("/")
    key = load_env("WORKER_KEY")
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Worker-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:  # noqa: BLE001
            return e.code, {}
    except (urllib.error.URLError, OSError, ValueError) as e:
        log(f"POST {path} failed: {e}")
        return 0, {}


def ack(event_id: str, resolution: str) -> bool:
    status, payload = api("/api/worker/inbox/ack", {"eventId": event_id, "resolution": resolution})
    if status != 200 or not payload.get("ok"):
        log(f"ack {resolution!r} FAILED for {event_id[-6:]}: status={status} {payload}")
        return False
    log(f"ack {event_id[-6:]} -> {resolution}")
    return True


def last_json(text: str) -> dict:
    """Last top-level JSON object in stdout (handles compact + pretty summaries)."""
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


# --- email (invokes the shared send-email.ts single source of truth) --------

def _email_runtime() -> str | None:
    if shutil.which("bun"):
        return "bun"
    if shutil.which("node"):
        return "node"
    return None


def shell_send_email(to: str, template: str, data: dict) -> bool:
    """Best-effort transactional email via skills/email-channel/scripts/send-email.ts.
    Never raises — an email failure logs and returns False."""
    if not to:
        return False
    runtime = _email_runtime()
    script = os.path.join(REPO, "skills", "email-channel", "scripts", "send-email.ts")
    if not runtime or not os.path.exists(script):
        log(f"email {template} -> {to}: skipped (runtime/script unavailable)")
        return False
    argv = ([runtime, "run", script] if runtime == "bun" else [runtime, script]) + [
        "--to", to, "--template", template, "--data", json.dumps(data),
    ]
    try:
        subprocess.run(argv, check=True, cwd=REPO, timeout=60, capture_output=True)
        log(f"email {template} -> {to}")
        return True
    except Exception as e:  # noqa: BLE001 — email is best-effort
        err = getattr(e, "stderr", None)
        detail = err.decode()[:200] if isinstance(err, (bytes, bytearray)) else str(e)
        log(f"email {template} -> {to} FAILED: {detail}")
        return False


# --- storyboard revise (LLM minimal edit) ----------------------------------

def slug_for(job: dict) -> str:
    base = (job.get("productName") or "job").lower()
    base = "".join(c if c.isalnum() else "-" for c in base).strip("-") or "job"
    return f"{base}-{job['jobId'][-6:]}"


def build_revise_messages(original: dict, feedback_text: str) -> list[dict]:
    system = (
        "You are the LaunchReel Strategist handling a customer revision on a 30-second "
        "SaaS launch trailer. You are given the CURRENT storyboard JSON and the customer's "
        "feedback. Apply the SMALLEST change that satisfies the feedback and nothing more. "
        "You may ONLY change: brand.colors (hex values), and per-scene headline, sub, metrics, "
        "and quote. You must NEVER change scene order or scene types, screenshotPaths, the "
        "watermark, durations, brand.name, brand.url, or audio. Keep headlines 3-7 words. Do "
        "not invent metrics or testimonials. Preserve everything the feedback does not ask to "
        "change — return the copy verbatim where untouched."
    )
    user = (
        "CURRENT storyboard JSON:\n"
        + json.dumps(original, ensure_ascii=False, indent=2)
        + "\n\nCUSTOMER FEEDBACK:\n"
        + feedback_text.strip()
        + "\n\nReturn ONE JSON object with EXACTLY these two keys:\n"
        '{ "storyboard": <the full edited storyboard, same schema as above>, '
        '"whatChanged": "<one short sentence, plain English, describing what you changed> " }'
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def merge_allowed(original: dict, edited: dict) -> dict:
    """Build the revised storyboard from the ORIGINAL, applying only the allowed
    fields from the LLM's edit. This structurally guarantees scene order, types,
    screenshotPaths, durations, watermark, brand.name/url and audio are untouched
    no matter what the model returns."""
    out = copy.deepcopy(original)

    # brand.colors — only valid hex overrides.
    edited_colors = ((edited.get("brand") or {}).get("colors") or {})
    out_colors = out.setdefault("brand", {}).setdefault("colors", {})
    for k, val in edited_colors.items():
        if isinstance(val, str) and sb_mod.HEX_RE.match(val):
            out_colors[k] = val

    # Per-scene allowed fields, matched by scene type (fallback to index).
    edited_scenes = edited.get("scenes") or []
    edited_by_type: dict = {}
    for es in edited_scenes:
        if isinstance(es, dict) and es.get("type") and es["type"] not in edited_by_type:
            edited_by_type[es["type"]] = es

    for idx, sc in enumerate(out.get("scenes") or []):
        t = sc.get("type")
        es = edited_by_type.get(t)
        if es is None and idx < len(edited_scenes) and isinstance(edited_scenes[idx], dict):
            es = edited_scenes[idx]
        if not isinstance(es, dict):
            continue
        hl = es.get("headline")
        if isinstance(hl, str) and hl.strip():
            sc["headline"] = sb_mod.clamp_words(hl.strip(), hi=8)
        sub = es.get("sub")
        if isinstance(sub, str) and sub.strip():
            sc["sub"] = sb_mod.truncate_words(sub.strip(), 120)
        if isinstance(es.get("metrics"), list):
            cleaned = []
            for m in es["metrics"]:
                if isinstance(m, dict) and m.get("label") and m.get("value") is not None:
                    cleaned.append({
                        "label": sb_mod.truncate_words(str(m["label"]), 22),
                        "value": sb_mod.truncate_words(str(m["value"]), 16),
                    })
            if cleaned:
                sc["metrics"] = cleaned[: (1 if t == "tour_b" else 3)]
        if isinstance(es.get("quote"), dict) and es["quote"].get("text"):
            sc["quote"] = {
                "text": sb_mod.truncate_words(str(es["quote"]["text"]), 158),
                "author": str(es["quote"].get("author", ""))[:60],
            }
    return out


def summarize_changes(original: dict, merged: dict) -> str:
    bits: list[str] = []
    oc = ((original.get("brand") or {}).get("colors") or {})
    mc = ((merged.get("brand") or {}).get("colors") or {})
    for k in ("accent", "bg", "ink", "accent2", "paper"):
        if mc.get(k) and oc.get(k) != mc.get(k):
            bits.append(f"{k} color → {mc[k]}")
    for a, b in zip(original.get("scenes", []), merged.get("scenes", [])):
        if (a.get("headline") or "") != (b.get("headline") or ""):
            bits.append(f"{b.get('type')} headline → “{b.get('headline')}”")
    return "; ".join(bits[:4]) or "Applied your requested tweaks and re-rendered."


def llm_revise(original: dict, feedback_text: str, job: dict, bundle_dir: str) -> tuple[dict | None, str]:
    """Return (revised_storyboard, what_changed) or (None, reason) on failure."""
    key = load_env("OPENAI_API_KEY")
    if not key:
        log("no OPENAI_API_KEY — cannot revise")
        return None, "no OPENAI_API_KEY"
    schema = sb_mod.load_schema(STORYBOARD_SCHEMA)
    manifest = sb_mod.read_json(os.path.join(bundle_dir, "manifest.json"))
    screenshots = sb_mod.available_screenshots(bundle_dir, manifest)
    # Derive tier from the storyboard's own watermark so the watermark semantic
    # check is self-consistent (watermark is preserved from the original).
    tier = "teaser" if original.get("watermark") else "trailer"

    messages = build_revise_messages(original, feedback_text)
    errors_feedback = None
    for attempt in (1, 2):
        msgs = list(messages)
        if errors_feedback:
            msgs.append({"role": "user", "content":
                         "Your previous JSON had these problems — fix them and return the full "
                         "corrected object:\n- " + "\n- ".join(errors_feedback)})
        try:
            raw, _usage = sb_mod.call_openai(REVISE_MODEL, key, msgs)
        except Exception as e:  # noqa: BLE001 — API/parse errors: try next attempt
            detail = e.read().decode()[:200] if hasattr(e, "read") else str(e)
            log(f"revise LLM call failed (attempt {attempt}): {detail}")
            errors_feedback = None
            continue
        edited = raw.get("storyboard", raw)
        what = str(raw.get("whatChanged", "")).strip()
        merged = merge_allowed(original, edited)
        errs = sb_mod.schema_errors(merged, schema) + sb_mod.semantic_errors(merged, screenshots, tier)
        if not errs:
            return merged, (what or summarize_changes(original, merged))
        log(f"revise attempt {attempt}: {len(errs)} issue(s) after merge: {errs[:3]}")
        errors_feedback = errs
    return None, "revision failed validation"


# --- render + deliver ------------------------------------------------------

def run_cmd(label: str, cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=timeout)
    if r.stderr.strip():
        for line in r.stderr.strip().splitlines()[-4:]:
            log(f"  {label}| {line}")
    return r


def regenerate_storyboard(job: dict, bundle_dir: str, storyboard_path: str) -> bool:
    """Fallback when the job's bundle is gone: rebuild storyboard.json from the
    job fields via storyboard.py (renders without narration if there is no vo)."""
    os.makedirs(bundle_dir, exist_ok=True)
    cmd = [sys.executable, STORYBOARD_PY, "--bundle-dir", bundle_dir,
           "--product-name", job.get("productName") or "",
           "--one-liner", job.get("oneLiner") or "",
           "--url", job.get("url") or "",
           "--tier", job.get("tier") or "teaser",
           "--out", storyboard_path, "--vo-out", os.path.join(bundle_dir, "vo.txt")]
    r = run_cmd("regen", cmd, timeout=300)
    return r.returncode == 0 and os.path.exists(storyboard_path)


def render_and_upload(job: dict, bundle_dir: str, revised: dict) -> tuple[str | None, str | None]:
    """Write the revised storyboard, render into <bundle>/rev1/, upload to R2 at
    <jobId>/rev1/ via deliver.py (--no-convex). Return (videoUrl, posterUrl)."""
    job_id = job["jobId"]
    rev_dir = os.path.join(bundle_dir, "rev1")
    os.makedirs(rev_dir, exist_ok=True)
    rev_storyboard = os.path.join(rev_dir, "storyboard.json")
    with open(rev_storyboard, "w", encoding="utf-8") as fh:
        json.dump(revised, fh, indent=2)

    rev_slug = f"{slug_for(job)}-rev1"
    # Assets resolve against the ORIGINAL bundle (vo.mp3 + screenshots live there);
    # the revised storyboard keeps those same relative paths. --reuse-bundle reuses
    # the pipeline's existing Remotion bundle (lighter than a fresh bundle; falls
    # back to bundling if the cache is missing).
    r = run_cmd("render", [RENDER_SH, "--storyboard", rev_storyboard, "--assets", bundle_dir,
                           "--out", rev_dir, "--slug", rev_slug, "--reuse-bundle"], timeout=1800)
    if r.returncode != 0:
        log(f"render FAILED (rc={r.returncode})")
        return None, None
    summary = last_json(r.stdout)
    mp4 = summary.get("mp4") or os.path.join(rev_dir, "trailer.mp4")
    poster = summary.get("poster") or os.path.join(rev_dir, "poster.png")
    if not os.path.exists(mp4):
        log(f"render produced no mp4 at {mp4}")
        return None, None
    log(f"render ok: {summary.get('renderSec', '?')}s, {summary.get('mb', '?')}MB")

    # deliver.py handles R2 (+ web fallback); we re-deliver via the revision
    # endpoint ourselves, so skip its Convex update. The composite job-id makes
    # the R2 key <jobId>/rev1/trailer.mp4.
    d = run_cmd("deliver", [sys.executable, DELIVER_PY, "--job-id", f"{job_id}/rev1",
                            "--mp4", mp4, "--poster", poster, "--no-convex"], timeout=600)
    if d.returncode != 0:
        log(f"deliver FAILED (rc={d.returncode})")
        return None, None
    delivered = last_json(d.stdout)
    return delivered.get("videoUrl"), delivered.get("posterUrl")


# --- per-item processing ---------------------------------------------------

# --- intent classification (protects the one-revision budget) ----------------

VALID_INTENTS = {"revision_request", "question", "acknowledgment", "new_order_info", "other"}

STAGE_HUMAN = {
    "queued": "queued and about to start",
    "research": "having its website researched",
    "awaiting_info": "waiting on the details we asked you for",
    "storyboard": "getting its storyboard written",
    "voiceover": "having its voiceover recorded",
    "rendering": "rendering the motion graphics",
    "awaiting_approval": "in final QA before it ships",
    "delivered": "delivered — check your inbox for the final cut",
    "failed": "with a human director for a hand-finish",
}


def classify_intent(text: str, job: dict) -> str:
    """Classify one customer reply so an ack doesn't burn a revision and a status
    question gets answered instead of re-rendered or escalated. Returns one of
    VALID_INTENTS. Fails open to 'other' (flows to the existing routing) on any error."""
    key = load_env("OPENAI_API_KEY")
    if not key:
        return "other"
    system = (
        "You classify ONE customer email reply to an automated launch-trailer service. "
        "Return JSON {\"intent\": one of "
        "[\"revision_request\",\"question\",\"acknowledgment\",\"new_order_info\",\"other\"]}.\n"
        "- revision_request: asks for a specific CHANGE to the video (a color, headline, "
        "hook, the CTA, music, tone, length, 'make it more X', 'can you change Y').\n"
        "- question: asks something and expects an answer, not a change (status, timing, "
        "'is it ready?', 'what is the status', 'how does this work?', 'what tier?').\n"
        "- acknowledgment: content-free, no request or info ('ok', 'thanks', 'got it', "
        "'sounds good', 'great', 'let me know', 'will do').\n"
        "- new_order_info: provides product details — what it does, who it's for, features, "
        "positioning (typically answering our questions).\n"
        "- other: anything else. Judge ONLY from the reply text."
    )
    user = f"Job status: {job.get('status')}\nCustomer reply:\n{text.strip()[:1500]}\n\nClassify."
    try:
        raw, _usage = sb_mod.call_openai(REVISE_MODEL, key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        intent = str(raw.get("intent", "")).strip() if isinstance(raw, dict) else ""
        return intent if intent in VALID_INTENTS else "other"
    except Exception as e:  # noqa: BLE001 — fail open to the existing routing
        log(f"intent classify failed ({e}); treating as 'other'")
        return "other"


def _reply_status(email, job: dict, send_email) -> None:
    """Answer a status/timing question with the job's current stage + live dashboard
    link — no revision, no escalation."""
    if not email:
        return
    product = job.get("productName") or "your launch"
    human = STAGE_HUMAN.get(job.get("status"), "in production")
    web = (load_env("WEB_BASE_URL") or "https://launchreel.pages.dev").rstrip("/")
    jid = job.get("jobId")
    dash = f"{web}/#job={jid}" if jid else web
    send_email(email, "reply", {
        "subject": f"Re: your {product} trailer",
        "heading": "Here's where your trailer's at \U0001F3AC",
        "body": (f"Your {product} trailer is currently {human}.\n\n"
                 f"You can watch it build live here:\n{dash}\n\n"
                 "Reply any time with a change and we'll fold it in."),
    })


# Job statuses where the trailer isn't delivered yet but the customer can still steer
# the cut. Feedback here re-queues the storyboard WITH the note (not a paid revision).
PRE_DELIVERY_STATUSES = {"storyboard", "voiceover", "rendering", "awaiting_approval"}


def process_item(item: dict, send_email) -> str:
    """Route one inbound email. Stage-aware: a reply while the sender's most recent job
    is awaiting_info (we asked for details) or pre-delivery (storyboard..awaiting_approval)
    is folded back into THAT job and re-queued; a reply after delivery runs the existing
    one-shot revision loop. Always acks exactly once; never raises (the caller guards)."""
    event_id = item["eventId"]
    email = item.get("email")
    text = (item.get("text") or "").strip()
    subject = item.get("subject") or ""
    latest = item.get("latestJob")  # sender's newest job (any status) — new Convex only
    job = item.get("job")           # sender's newest job WITH a video — revision target
    log(f"inbound {event_id[-6:]}: from={email!r} subject={subject!r} text={text[:80]!r}")

    # 0. Two-video comparison (the demo): if this inbound carries >=2 videos —
    # attachments the worker uploaded (attachmentUrls) or direct links in the body —
    # score both on the rubric and reply with the head-to-head, AHEAD of the
    # revision path. handle_compare never raises and returns False when it's not a
    # compare request, so the normal routing below is unaffected.
    if compare.handle_compare(item, send_email=send_email):
        ack(event_id, "compared")
        return "compared"

    # Intent gate: protect the one-revision budget and answer questions smartly. A
    # content-free ack ("ok, let me know") must NOT trigger a revision; a status
    # question ("what is the status") gets a status reply, not a re-render or an
    # escalation. Only real change/answer intents fall through to the routing below.
    # Runs only with text + a job to talk about; fails open to the routing otherwise.
    target = latest if isinstance(latest, dict) else (job if isinstance(job, dict) else None)
    if text and isinstance(target, dict):
        intent = classify_intent(text, target)
        log(f"intent={intent} (status={target.get('status')})")
        if intent == "acknowledgment":
            ack(event_id, "acknowledged")  # no email — a 👍 doesn't need a reply
            return "acknowledged"
        if intent == "question":
            _reply_status(email, target, send_email)
            ack(event_id, "status_answered")
            return "status_answered"
        # revision_request | new_order_info | other -> fall through to stage routing

    # Stage-aware routing. Only fires on new Convex (which returns latestJob); on old
    # Convex latest is None and we fall straight through to the delivered path — so an
    # old worker keeps behaving exactly as before until it's restarted.
    if isinstance(latest, dict):
        status = latest.get("status")
        if status == "awaiting_info":
            return _handle_awaiting_info(event_id, email, text, subject, latest, send_email)
        if status in PRE_DELIVERY_STATUSES:
            return _handle_pre_delivery(event_id, email, text, subject, latest, send_email)

    return _handle_delivered(event_id, email, text, subject, job, send_email)


def _fetch_job(job_id: str) -> dict | None:
    """Full job + owner email via the worker lookup endpoint (used on the rare
    pre-delivery→delivered race)."""
    status, payload = api("/api/worker/job", {"jobId": job_id})
    if status == 200 and isinstance(payload.get("job"), dict):
        return payload["job"]
    return None


def _fold_info(brief: dict, reply_text: str) -> dict:
    """LLM-fold the customer's answer to our clarifying questions into the research
    brief JSON. Always stashes the raw reply in customerNotes — that's what makes the
    re-queued job pass the sufficiency gate and what the storyboard honors verbatim.
    Never invents; on any failure it degrades to a notes-only merge."""
    base = dict(brief or {})
    prior = str(base.get("customerNotes") or "").strip()
    base["customerNotes"] = (prior + "\n" + reply_text).strip() if prior else reply_text

    key = load_env("OPENAI_API_KEY")
    if not key:
        return base
    system = (
        "You are LaunchReel's intake producer. Merge the customer's reply into the "
        "research brief JSON so a strategist can write a truthful launch trailer. Fill "
        "oneLiner, category, audience, keyFeatures, socialProof, tone, brandAdjectives "
        "ONLY from what the customer actually said or what is already in the brief — "
        "never invent metrics, customers, ratings, or claims. Keep existing non-empty "
        "fields unless the customer corrects them. Return JSON: {\"brief\": { ... }}."
    )
    user = (
        "CURRENT brief JSON:\n" + json.dumps(brief or {}, ensure_ascii=False)
        + "\n\nCUSTOMER REPLY:\n" + reply_text.strip()
        + "\n\nReturn the merged brief now."
    )
    try:
        raw, _usage = sb_mod.call_openai(REVISE_MODEL, key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        folded = raw.get("brief", raw) if isinstance(raw, dict) else None
        if isinstance(folded, dict):
            folded["customerNotes"] = base["customerNotes"]  # never lose the raw words
            return folded
    except Exception as e:  # noqa: BLE001 — any failure ⇒ notes-only merge
        log(f"fold_info LLM failed ({e}); storing raw notes only")
    return base


def _handle_awaiting_info(event_id: str, email, text: str, subject: str,
                          latest: dict, send_email) -> str:
    """The sender is answering our clarifying questions. Fold the reply into the brief
    and re-queue; the next pass clears the sufficiency gate (customerNotes present) and
    the storyboard honors the answer. Never counts as a revision."""
    job_id = latest["jobId"]
    product = latest.get("productName") or "your launch"
    if not text:
        if email:
            send_email(email, "reply", {
                "subject": f"Re: your {product} trailer",
                "heading": "Still need a couple details \U0001F3AC",
                "body": ("Thanks for the reply! We couldn't find any specifics in it. Send a "
                         "sentence on what it does, who it's for, and the main benefit — or attach "
                         "2-3 screenshots or your logo — and we'll roll camera."),
            })
        ack(event_id, "info_incomplete")
        return "info_incomplete"

    merged = _fold_info(latest.get("brief") or {}, text)
    status, payload = api("/api/worker/resume-info", {"jobId": job_id, "brief": merged})
    if status != 200 or not payload.get("ok"):
        # Raced out of awaiting_info (another lane resumed it) — ack and move on.
        log(f"resume-info no-op for {job_id[-6:]}: status={status} {payload}")
        ack(event_id, "info_stale")
        return "info_stale"
    ack(event_id, "info_received")
    if email:
        send_email(email, "reply", {
            "subject": f"Re: your {product} trailer",
            "heading": "Got it — the crew is rolling \U0001F3AC",
            "body": ("Perfect, that's exactly what we needed. Your trailer is back in production "
                     "with your notes baked in — it'll land in your inbox shortly."),
        })
    return "info_received"


def _handle_pre_delivery(event_id: str, email, text: str, subject: str,
                         latest: dict, send_email) -> str:
    """The sender is reacting to the storyline preview before delivery. Append the note
    to brief.feedbackNotes and re-queue so the storyboard re-runs WITH it. Does NOT
    count against the one post-delivery revision."""
    job_id = latest["jobId"]
    product = latest.get("productName") or "your launch"
    if not text:
        if email:
            send_email(email, "reply", {
                "subject": f"Re: your {product} trailer",
                "heading": "Happy to tweak it — what should we change?",
                "body": ("We got your reply but couldn't find a specific change to make. Tell us "
                         "what to adjust — a hook, the CTA, a color — and we'll fold it into the cut."),
            })
        ack(event_id, "feedback_incomplete")
        return "feedback_incomplete"

    status, payload = api("/api/worker/requeue-feedback", {"jobId": job_id, "feedback": text})
    if status != 200 or not payload.get("ok"):
        # Raced to delivered between the inbox read and here — run the delivered path on
        # the freshly-finished job rather than lose the customer's note.
        if payload.get("error") == "not pre-delivery":
            fetched = _fetch_job(job_id)
            if fetched and fetched.get("videoUrl"):
                log(f"{job_id[-6:]} finished rendering mid-feedback — routing to revision path")
                return _handle_delivered(event_id, email, text, subject, fetched, send_email)
        log(f"requeue-feedback failed for {job_id[-6:]}: status={status} {payload}")
        _fail_reply(email, product, send_email)
        ack(event_id, "failed")
        return "failed"
    ack(event_id, "feedback_queued")
    if email:
        send_email(email, "reply", {
            "subject": f"Re: your {product} trailer",
            "heading": "Got it — folding that in \U0001F3AC",
            "body": ("Thanks! We're re-cutting your trailer with that change now. You'll get the "
                     "updated storyline and the finished cut shortly."),
        })
    return "feedback_queued"


def _handle_delivered(event_id: str, email, text: str, subject: str, job, send_email) -> str:
    """The sender is replying after delivery — the existing one-free-revision loop."""
    # 1. No finished trailer to revise.
    if not job or not job.get("videoUrl"):
        if email:
            send_email(email, "reply", {
                "subject": "We couldn't find your trailer",
                "heading": "We couldn't find a trailer to revise",
                "body": ("Thanks for the note! We couldn't match your email to a finished "
                         "LaunchReel trailer yet.\n\nIf you started one with a different address, "
                         "reply from that inbox — or head to launchreel.pages.dev to kick one off "
                         "and we'll take it from there."),
            })
        ack(event_id, "no_job")
        return "no_job"

    job_id = job["jobId"]
    product = job.get("productName") or "your launch"

    # 2. Revision already spent -> escalate to a human.
    if (job.get("revisionCount") or 0) >= 1:
        if email:
            send_email(email, "reply", {
                "subject": f"Re: your {product} trailer",
                "heading": "Our human director is on it \U0001F440",
                "body": ("You've already used your one free automated revision, so we've handed "
                         "this over to a human director on the LaunchReel team.\n\nThey'll read "
                         "your note and follow up personally. Thanks for your patience!"),
            })
        ack(event_id, "escalated_human")
        return "escalated_human"

    # 3. No actionable feedback text -> ask for specifics (keeps their revision).
    if not text:
        if email:
            send_email(email, "reply", {
                "subject": f"Re: your {product} trailer",
                "heading": "Happy to tweak it — what should we change?",
                "body": ("We got your reply but couldn't find any specifics to act on. Reply with "
                         "what you'd like changed (a color, a headline, the tagline) and we'll "
                         "recut it right away."),
            })
        ack(event_id, "failed")
        return "failed"

    # 4. Apply the one revision.
    bundle_dir = os.path.join(REPO, ".tmp", "scout", job_id)
    storyboard_path = os.path.join(bundle_dir, "storyboard.json")
    original = sb_mod.read_json(storyboard_path)
    if not original:
        log(f"storyboard missing at {storyboard_path}; regenerating from job fields")
        if regenerate_storyboard(job, bundle_dir, storyboard_path):
            original = sb_mod.read_json(storyboard_path)
    if not original:
        log("could not obtain a storyboard to revise")
        _fail_reply(email, product, send_email)
        ack(event_id, "failed")
        return "failed"

    revised, what_changed = llm_revise(original, text, job, bundle_dir)
    if revised is None:
        log(f"llm_revise failed: {what_changed}")
        _fail_reply(email, product, send_email)
        ack(event_id, "failed")
        return "failed"
    log(f"what changed: {what_changed}")

    video_url, poster_url = render_and_upload(job, bundle_dir, revised)
    if not video_url or not poster_url:
        _fail_reply(email, product, send_email)
        ack(event_id, "failed")
        return "failed"

    status, payload = api("/api/worker/revision",
                          {"jobId": job_id, "videoUrl": video_url, "posterUrl": poster_url})
    if status != 200 or not payload.get("ok"):
        # 409 "already revised" = a concurrent lane beat us. Treat as escalation.
        if payload.get("error") == "already revised":
            log("revision already applied by another lane — escalating")
            ack(event_id, "escalated_human")
            return "escalated_human"
        log(f"applyRevision FAILED: status={status} {payload}")
        _fail_reply(email, product, send_email)
        ack(event_id, "failed")
        return "failed"
    log(f"revision applied: revisionCount={payload.get('revisionCount')}, video={video_url}")

    ack(event_id, "revised")
    if email:
        send_email(email, "revision_ready", {
            "productName": product,
            "tier": job.get("tier"),
            "whatChanged": what_changed,
            "videoUrl": video_url,
            "posterUrl": poster_url,
            "dashboardUrl": load_env("WEB_BASE_URL") or "https://launchreel.pages.dev",
        })
    return "revised"


def _fail_reply(email: str | None, product: str, send_email) -> None:
    if not email:
        return
    send_email(email, "reply", {
        "subject": f"Re: your {product} trailer",
        "heading": "We're on it — a human is taking a look",
        "body": ("Thanks for the note! We hit a snag auto-applying this change, so a human "
                 "director on our team is picking it up and will follow up shortly."),
    })


# --- drain / modes ---------------------------------------------------------

def _drain_inbox(limit: int, send_email) -> dict:
    status, payload = api("/api/worker/inbox", {"limit": limit})
    if status != 200:
        log(f"inbox fetch failed: status={status} {payload}")
        return {"error": "inbox_fetch", "status": status}
    items = payload.get("items") or []
    if not items:
        log("inbox empty")
        return {"processed": 0, "results": []}
    results = []
    for item in items:
        try:
            res = process_item(item, send_email)
        except Exception as e:  # noqa: BLE001 — never let one bad item crash the loop
            log(f"process error for {str(item.get('eventId', '?'))[-6:]}: {e}")
            try:
                ack(item["eventId"], "failed")
            except Exception:  # noqa: BLE001
                pass
            res = "error"
        results.append({"eventId": item.get("eventId"), "resolution": res})
    log(f"inbox drained: {len(results)} item(s): {[r['resolution'] for r in results]}")
    return {"processed": len(results), "results": results}


def check_inbox_once(limit: int = 25, send_email=None) -> dict:
    """Drain the inbox once, single-flight. Safe to call from the worker's poll
    loop; returns immediately if a drain is already running."""
    if not _INBOX_LOCK.acquire(blocking=False):
        return {"skipped": "in-flight"}
    try:
        return _drain_inbox(limit=limit, send_email=send_email or shell_send_email)
    finally:
        _INBOX_LOCK.release()


def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel autonomous email revision loop")
    ap.add_argument("--once", action="store_true", help="drain the inbox once, then exit (default)")
    ap.add_argument("--daemon", action="store_true", help="poll the inbox forever")
    ap.add_argument("--poll", type=float, default=DEFAULT_POLL, help="daemon poll interval seconds")
    ap.add_argument("--limit", type=int, default=25, help="max inbound items per drain")
    args = ap.parse_args()

    if not load_env("CONVEX_SITE_URL") or not load_env("WORKER_KEY"):
        log("ERROR: CONVEX_SITE_URL and WORKER_KEY are required")
        return 1

    if args.daemon:
        log(f"feedback daemon up (poll {args.poll}s) -> {load_env('CONVEX_SITE_URL')}")
        while True:
            try:
                check_inbox_once(limit=args.limit)
            except KeyboardInterrupt:
                raise
            except Exception as e:  # noqa: BLE001 — transient errors: back off, retry
                log(f"drain error: {e}")
            time.sleep(args.poll)

    res = check_inbox_once(limit=args.limit)
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
