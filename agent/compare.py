#!/usr/bin/env python3
"""compare.py — inbound "compare these two trailers" handler (the email demo).

A client emails reel@ctxmill.com with TWO videos — as attachments (uploaded to R2
by the inbound Email Worker, arriving as attachmentUrls[]) or as direct links in
the body — and gets back a per-criterion comparison + an overall winner.

handle_compare(event) is the single entrypoint the feedback loop calls AHEAD of the
revision path:
  * < 2 video sources  -> returns False (not a compare request; fall through).
  * >= 2 video sources -> scores BOTH on the LaunchReel rubric via
                          eval/scripts/video-compare.py, emails the head-to-head with
                          the `video_compare` template, and returns True (it OWNS this
                          inbound — never misroute a comparison into the revision path).

It never raises: any internal failure sends a short best-effort "couldn't compare"
note and still returns True so the caller acks the event exactly once.

Video sources = event.attachmentUrls[] (from the worker) + any direct video-file
links (mp4/webm/mov/m4v, incl. R2 pub URLs) found in the body text.

Env: GEMINI_API_KEY (scoring), RESEND_API_KEY (email). Reads .env/.env.local/
ops/hermes/.env as fallbacks (same as the rest of the agent).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_COMPARE_PY = os.path.join(REPO, "eval", "scripts", "video-compare.py")
ENV_FILES = (".env", ".env.local", os.path.join("ops", "hermes", ".env"))
COMPARE_MODEL = os.environ.get("COMPARE_MODEL", "gemini-2.5-flash")

# Direct video-file links (allow a query string). Drive/Loom share links are not
# direct-file and are intentionally out of scope for the demo (see task notes).
_URL_RE = re.compile(r"https?://[^\s<>\")]+", re.I)
_VIDEO_EXT_RE = re.compile(r"\.(mp4|webm|mov|m4v)(\?[^\s]*)?$", re.I)


def log(msg: str) -> None:
    print(f"[compare] {msg}", flush=True)


# --- env / email (self-contained so compare.py is standalone-testable) ------

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
                        return v.strip().strip('"').strip("'")
        except OSError:
            continue
    return ""


def _email_runtime() -> str | None:
    if shutil.which("bun"):
        return "bun"
    if shutil.which("node"):
        return "node"
    return None


def _default_send_email(to: str, template: str, data: dict) -> bool:
    """Best-effort transactional email via skills/email-channel/scripts/send-email.ts.
    Used when the caller doesn't inject its own sender. Never raises."""
    if not to:
        return False
    runtime = _email_runtime()
    script = os.path.join(REPO, "skills", "email-channel", "scripts", "send-email.ts")
    if not runtime or not os.path.exists(script):
        log(f"email {template} -> {to}: skipped (runtime/script unavailable)")
        return False
    argv = ([runtime, "run", script] if runtime == "bun" else [runtime, script]) + [
        "--to", to, "--template", template, "--data", json.dumps(data)]
    try:
        subprocess.run(argv, check=True, cwd=REPO, timeout=60, capture_output=True)
        log(f"email {template} -> {to}")
        return True
    except Exception as e:  # noqa: BLE001
        err = getattr(e, "stderr", None)
        detail = err.decode()[:200] if isinstance(err, (bytes, bytearray)) else str(e)
        log(f"email {template} -> {to} FAILED: {detail}")
        return False


# --- source extraction -----------------------------------------------------

def extract_video_urls(text: str) -> list[str]:
    if not text:
        return []
    out = []
    for m in _URL_RE.findall(text):
        u = m.rstrip(".,);]>")
        if _VIDEO_EXT_RE.search(u):
            out.append(u)
    return out


def collect_sources(event: dict) -> list[str]:
    """Ordered, de-duped video sources: worker attachments first, then body links."""
    sources: list[str] = []
    seen = set()
    for u in (event.get("attachmentUrls") or []):
        if isinstance(u, str) and u and u not in seen:
            sources.append(u)
            seen.add(u)
    for u in extract_video_urls(event.get("text") or ""):
        if u not in seen:
            sources.append(u)
            seen.add(u)
    return sources


def label_from_url(url: str, fallback: str) -> str:
    """A compact human label from a URL: '<parent>/<basename-no-ext>', capped."""
    try:
        path = url.split("?")[0].rstrip("/")
        parts = [p for p in path.split("/") if p]
        base = re.sub(r"\.(mp4|webm|mov|m4v)$", "", parts[-1], flags=re.I) if parts else ""
        parent = parts[-2] if len(parts) >= 2 else ""
        label = f"{parent[:10]}/{base}" if parent and base else (base or parent or fallback)
        return label[:28] or fallback
    except Exception:  # noqa: BLE001
        return fallback


# --- compare ---------------------------------------------------------------

def run_video_compare(a: str, b: str, label_a: str, label_b: str,
                      out_path: str, tier: str = "paid") -> dict | None:
    cmd = [sys.executable, VIDEO_COMPARE_PY, "--a", a, "--b", b,
           "--a-label", label_a, "--b-label", label_b, "--out", out_path,
           "--tier", tier, "--frames", "8", "--model", COMPARE_MODEL]
    log(f"scoring A={label_a!r} vs B={label_b!r}")
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=900)
    if r.stderr.strip():
        for line in r.stderr.strip().splitlines()[-6:]:
            log(f"  vc| {line}")
    if r.returncode != 0 or not os.path.exists(out_path):
        log(f"video-compare failed (rc={r.returncode})")
        return None
    try:
        with open(out_path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        log(f"could not read compare result: {e}")
        return None


def _email_data(result: dict) -> dict:
    """Map the video-compare result onto the `video_compare` email template fields."""
    return {
        "labelA": result.get("labelA"),
        "labelB": result.get("labelB"),
        "winner": result.get("winner"),
        "scoreA": result.get("scoreA"),
        "scoreB": result.get("scoreB"),
        "summary": result.get("summary"),
        "perDimension": [
            {"dimension": r["dimension"], "a": r["a"], "b": r["b"],
             "winner": r["winner"], "why": r.get("why", "")}
            for r in (result.get("perDimension") or [])
        ],
        "brandNote": result.get("brandNote"),
    }


def handle_compare(event: dict, send_email=None) -> bool:
    """See module docstring. Returns True iff this inbound was a >=2-video compare
    request (whether or not the scoring ultimately succeeded). Never raises."""
    send = send_email or _default_send_email
    try:
        sources = collect_sources(event)
    except Exception as e:  # noqa: BLE001
        log(f"source parse error: {e}")
        return False
    if len(sources) < 2:
        return False  # not a compare request — let the normal router handle it

    email = event.get("email")
    a, b = sources[0], sources[1]
    label_a = label_from_url(a, "Video A")
    label_b = label_from_url(b, "Video B")
    log(f"compare request from {email!r}: {len(sources)} sources; using A={a} B={b}")

    try:
        with tempfile.TemporaryDirectory() as td:
            out_path = os.path.join(td, "compare.json")
            result = run_video_compare(a, b, label_a, label_b, out_path)
    except Exception as e:  # noqa: BLE001 — never let compare crash the loop
        log(f"compare error: {e}")
        result = None

    if not result:
        if email:
            send(email, "reply", {
                "subject": "We couldn't compare those two videos",
                "heading": "We hit a snag comparing your two trailers",
                "body": ("Thanks for sending those over! We couldn't score both videos "
                         "automatically — one of the links may not be a direct video file "
                         "(mp4/webm/mov). Reply with two direct video links or attachments "
                         "and a human on our team will run the comparison."),
            })
        return True  # it WAS a compare request; we own the outcome (don't misroute)

    log("compare result:\n" + result.get("table_text", ""))
    if email:
        send(email, "video_compare", _email_data(result))
    return True


# --- standalone (debug / proof) --------------------------------------------

def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description="Two-video compare handler (standalone)")
    ap.add_argument("--email", default=None, help="reply-to (omit to skip the email)")
    ap.add_argument("--text", default="", help="body text to scan for video links")
    ap.add_argument("--attachment", action="append", default=[], help="attachment URL (repeatable)")
    ap.add_argument("--dry-run", action="store_true", help="don't actually send the email")
    args = ap.parse_args()

    event = {"email": args.email, "text": args.text, "attachmentUrls": args.attachment}
    sender = (lambda to, tpl, data: (log(f"[dry-run] would email {tpl} -> {to}: "
              + json.dumps(data)[:400]) or True)) if args.dry_run else None
    handled = handle_compare(event, send_email=sender)
    print(json.dumps({"handled": handled, "sources": collect_sources(event)}))
    return 0 if handled else 1


if __name__ == "__main__":
    sys.exit(main())
