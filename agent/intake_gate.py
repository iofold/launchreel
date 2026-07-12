#!/usr/bin/env python3
"""intake_gate.py — LaunchReel's "do we have enough to make a truthful trailer?" gate.

After Scout (research) runs, the worker calls assess() BEFORE storyboarding. When
the intake is too thin to cut something the customer will be proud to launch with —
AND the job has an owner we can ask — the worker parks the job at `awaiting_info`,
emails 2-4 SPECIFIC questions drafted by draft_questions(), and moves on (the lane
never blocks). When the customer replies, feedback.py folds the answer back into the
brief and re-queues the job; apply_carryover_notes() then re-attaches those notes to
the local brief so the second pass sails through the gate (customerNotes present ⇒
sufficient) and the storyboard honors them.

Sufficiency rule (calibrated on real Scout output — see eval/test-cases.json):
    insufficient = (no meaningful oneLiner)
                   AND (page.md < ~1500 chars)
                   AND (no screenshots captured OR the research brief is all-null)

Why gate on page.md richness rather than brief-nullness alone: the screenpipe hero
brief comes back all-null, yet the page has 13.8K chars of real copy + 3 real
screenshots and renders great. molagri's near-empty splash page (≈1.6K HTML, no real
copy) is the genuine "we have nothing truthful to show" case. page.md length is the
signal that separates them; a null brief only tips a thin page over the edge.

Seeded/unclaimed jobs (no owner email) never reach this gate — the worker only calls
it for jobs with an email, so a seeded YC trailer always renders best-effort as today.

Stdlib only. Reuses storyboard.py for the OpenAI caller + env loader + screenshot
discovery, imported lazily so a worker with a broken import still renders (the worker
guards the whole module behind a presence check too).
"""
import json
import os

AGENT = os.path.dirname(os.path.abspath(__file__))

try:  # reuse the storyboard OpenAI caller + env loader + screenshot discovery
    import sys as _sys
    if AGENT not in _sys.path:
        _sys.path.insert(0, AGENT)
    import storyboard as sb_mod
except Exception:  # noqa: BLE001 — degrade to deterministic fallbacks if unavailable
    sb_mod = None

PAGE_MD_MIN = 1500  # chars of clean page copy below which the page is "thin"
QUESTIONS_MODEL = os.environ.get("INTAKE_MODEL", "gpt-5-mini")
# Substantive brief fields (productName is excluded — it's always backfilled from
# the domain, so it doesn't count as real research signal).
SUBSTANTIVE_FIELDS = (
    "oneLiner", "category", "audience", "keyFeatures",
    "socialProof", "tone", "brandAdjectives",
)


def log(msg: str) -> None:
    print(f"[intake_gate] {msg}", flush=True)


def _read_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _populated(v) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip()) and v.strip().lower() != "null"
    if isinstance(v, (list, tuple, dict)):
        return len(v) > 0
    return bool(v)


def _meaningful_oneliner(text: str) -> bool:
    """A real value line, not an empty placeholder — needs >= 3 words."""
    return len((text or "").strip().split()) >= 3


def _page_md_chars(bundle_dir: str) -> int:
    path = os.path.join(bundle_dir, "page.md")
    if not os.path.exists(path):
        return 0
    try:
        with open(path, encoding="utf-8") as fh:
            return len(fh.read().strip())
    except OSError:
        return 0


def _screenshot_count(bundle_dir: str) -> int:
    manifest = _read_json(os.path.join(bundle_dir, "manifest.json"))
    if sb_mod is not None:
        try:
            return len(sb_mod.available_screenshots(bundle_dir, manifest))
        except Exception:  # noqa: BLE001
            pass
    # Fallback: count known screenshot files on disk.
    names = ("desktop-hero.png", "desktop-full.png", "mobile.png",
             "hero-fallback.png", "hero-fallback.jpg")
    return sum(1 for n in names if os.path.exists(os.path.join(bundle_dir, n)))


def assess(bundle_dir: str, job: dict) -> dict:
    """Return {sufficient: bool, reasons: [str], signals: {...}}.

    sufficient == True means the pipeline has enough to make an honest trailer.
    Reasons are the human-readable gaps (used to steer the drafted questions)."""
    brief = _read_json(os.path.join(bundle_dir, "brief.json")) or {}

    # A resumed job carries the customer's own words — always enough, and this is
    # what stops the gate from looping a job back to awaiting_info forever.
    if _populated(brief.get("customerNotes")) or _populated(brief.get("feedbackNotes")):
        return {"sufficient": True, "reasons": [], "signals": {"carryover_notes": True}}

    one_liner = (job.get("oneLiner") or brief.get("oneLiner") or "").strip()
    has_oneliner = _meaningful_oneliner(one_liner)
    page_len = _page_md_chars(bundle_dir)
    n_shots = _screenshot_count(bundle_dir)
    populated_fields = [f for f in SUBSTANTIVE_FIELDS if _populated(brief.get(f))]
    brief_all_null = len(populated_fields) == 0

    thin_page = page_len < PAGE_MD_MIN
    insufficient = (not has_oneliner) and thin_page and (n_shots == 0 or brief_all_null)

    reasons: list[str] = []
    if insufficient:
        if not has_oneliner:
            reasons.append("no clear one-line value proposition")
        reasons.append(f"almost no page copy to work from ({page_len} chars)")
        if n_shots == 0:
            reasons.append("no product screenshots could be captured")
        if brief_all_null:
            reasons.append("web research came back essentially empty")

    return {
        "sufficient": not insufficient,
        "reasons": reasons,
        "signals": {
            "has_oneliner": has_oneliner,
            "page_md_chars": page_len,
            "screenshots": n_shots,
            "brief_fields": populated_fields,
            "brief_all_null": brief_all_null,
        },
    }


def fallback_questions(product: str) -> list[str]:
    product = product or "your product"
    return [
        f"In one sentence, what does {product} do?",
        "Who is it for — what kind of person or team?",
        "What's the single biggest outcome someone gets from it?",
        "If you can, reply with 2-3 product screenshots or your logo attached.",
    ]


def draft_questions(job: dict, bundle_dir: str, decision: dict | None = None) -> list[str]:
    """Draft 2-4 SPECIFIC questions from what's genuinely missing, via gpt-5-mini.
    Falls back to a sensible fixed set if the model/key is unavailable."""
    product = (job.get("productName") or "").strip()
    if sb_mod is not None and not product:
        product = sb_mod.display_url(job.get("url") or "") or "your product"
    product = product or "your product"

    key = sb_mod.load_env_key("OPENAI_API_KEY") if sb_mod is not None else ""
    if not key or sb_mod is None:
        return fallback_questions(product)

    brief = _read_json(os.path.join(bundle_dir, "brief.json")) or {}
    reasons = (decision or {}).get("reasons") or []
    system = (
        "You are LaunchReel's intake producer. A customer ordered a 30-second launch "
        "trailer, but their website gave our agents too little to make one that's "
        "truthful and worth launching with. Ask 2 to 4 SHORT, specific, friendly "
        "questions that will unblock a great trailer — grounded in exactly what is "
        "missing, never generic boilerplate. Good asks: one sentence on what it does, "
        "who it's for, the #1 outcome/benefit, and a request for 2-3 product "
        "screenshots or the logo. Never ask more than 4. Never ask for anything you "
        "already know. Return JSON: {\"questions\": [\"...\", \"...\"]}."
    )
    user = (
        f"Product name (may just be a guess from the domain): {product}\n"
        f"URL: {job.get('url') or '(none provided)'}\n"
        f"What we managed to extract (may be sparse or empty):\n{json.dumps(brief, ensure_ascii=False)}\n"
        f"What's missing: {', '.join(reasons) if reasons else 'almost everything'}\n\n"
        "Write the questions now."
    )
    try:
        raw, _usage = sb_mod.call_openai(QUESTIONS_MODEL, key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        qs = raw.get("questions") if isinstance(raw, dict) else None
        cleaned = [str(q).strip() for q in (qs or []) if str(q).strip()][:4]
        if cleaned:
            return cleaned
    except Exception as e:  # noqa: BLE001 — any failure ⇒ fixed fallback
        log(f"draft_questions LLM failed ({e}); using fallback")
    return fallback_questions(product)


def apply_carryover_notes(job: dict, bundle_dir: str) -> bool:
    """Re-overlay customerNotes/feedbackNotes carried on the job's stored brief onto
    the LOCAL brief.json after Scout (which rewrites brief.json on every pass, and on
    a fresh box would otherwise drop a resumed reply). Returns True if it wrote notes.

    The stored brief comes from the claim payload (Convex jobs.brief), so this works
    even when the resume runs on a different worker/box than the original research."""
    stored = job.get("brief")
    if not isinstance(stored, dict):
        return False
    carry = {k: stored[k] for k in ("customerNotes", "feedbackNotes") if _populated(stored.get(k))}
    if not carry:
        return False
    path = os.path.join(bundle_dir, "brief.json")
    local = _read_json(path)
    if not local:
        # Scout produced nothing this pass (e.g. a no-url order) — seed the whole stored
        # brief so the storyboard gets the folded fields (oneLiner/audience/…), not just
        # the raw notes. When Scout DID run, keep its fresh research and only overlay notes.
        local = dict(stored)
    else:
        local.update(carry)
    try:
        os.makedirs(bundle_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(local, fh, ensure_ascii=False, indent=2)
        log(f"carried over {', '.join(carry)} into brief.json")
        return True
    except OSError as e:
        log(f"could not write carryover notes: {e}")
        return False


if __name__ == "__main__":  # tiny CLI for offline calibration/tests
    import argparse
    ap = argparse.ArgumentParser(description="LaunchReel intake sufficiency gate")
    ap.add_argument("--bundle-dir", required=True)
    ap.add_argument("--product-name", default="")
    ap.add_argument("--one-liner", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--email", default="owner@example.com")
    ap.add_argument("--questions", action="store_true", help="also draft questions")
    args = ap.parse_args()
    job = {"productName": args.product_name, "oneLiner": args.one_liner,
           "url": args.url, "email": args.email}
    decision = assess(args.bundle_dir, job)
    out = {"decision": decision}
    if args.questions and not decision["sufficient"]:
        out["questions"] = draft_questions(job, args.bundle_dir, decision)
    print(json.dumps(out, indent=2))
