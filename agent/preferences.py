#!/usr/bin/env python3
"""preferences.py — LaunchReel's learn→recall→apply preference loop.

Closes the customer-memory loop on top of profiles.py:

  LEARN  (distill_and_store): when a job closes — delivered, or a revision is
         processed — an LLM reads the interaction history (the customer's own
         notes, the revision they asked for, what actually changed, their acks)
         and MERGES a durable `preferences` block into BOTH the email-keyed and
         the company-keyed dossier: {hookStyle, paletteLeanings, tone, doNots[],
         likes[]}. Merge, never overwrite — scalars keep the newest non-empty
         value, doNots/likes accumulate (deduped, capped).

  RECALL/APPLY (load_prompt_block): the storyboard reads the merged preferences
         for the job's email + company and folds a short "this customer previously
         asked for / disliked …" instruction into its prompt.

Everything is best-effort and never raises — a preference write or read must never
fail a job. Reuses storyboard.py's OpenAI caller + env loader, and profiles.py's
dossier storage (email files + company-<slug>.json).
"""
from __future__ import annotations

import json
import os
import sys

AGENT = os.path.dirname(os.path.abspath(__file__))
if AGENT not in sys.path:
    sys.path.insert(0, AGENT)

try:
    import profiles  # dossier storage (email + company)
    import storyboard as sb_mod  # call_openai + load_env_key
except Exception:  # noqa: BLE001 — degrade quietly if the deps aren't importable
    profiles = None  # type: ignore
    sb_mod = None  # type: ignore

PREF_KEYS = ("hookStyle", "paletteLeanings", "tone", "doNots", "likes")
_SCALARS = ("hookStyle", "paletteLeanings", "tone")
_LISTS = ("doNots", "likes")
DISTILL_MODEL = os.environ.get("PREFERENCE_MODEL") or os.environ.get("FEEDBACK_MODEL", "gpt-5-mini")


def log(msg: str) -> None:
    print(f"[preferences] {msg}", flush=True)


def _empty() -> dict:
    return {"hookStyle": None, "paletteLeanings": None, "tone": None, "doNots": [], "likes": []}


def merge_preferences(old: dict | None, new: dict | None) -> dict:
    """Merge `new` into `old`: newest non-empty scalar wins; list items accumulate
    (case-insensitive dedupe, capped). Only the five known keys are kept."""
    out = _empty()
    for k in _SCALARS:
        v = (old or {}).get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()[:120]
    for k in _LISTS:
        out[k] = [str(x).strip() for x in ((old or {}).get(k) or []) if str(x).strip()]

    for k in _SCALARS:
        v = (new or {}).get(k)
        if isinstance(v, str) and v.strip() and v.strip().lower() not in ("null", "none", "unknown"):
            out[k] = v.strip()[:120]
    for k in _LISTS:
        seen = {c.lower() for c in out[k]}
        for item in (new or {}).get(k) or []:
            s = str(item).strip()
            if s and s.lower() not in seen:
                out[k].append(s)
                seen.add(s.lower())
        out[k] = out[k][:12]
    return out


def _has_signal(prefs: dict | None) -> bool:
    if not prefs:
        return False
    return bool(prefs.get("hookStyle") or prefs.get("paletteLeanings") or prefs.get("tone")
                or prefs.get("doNots") or prefs.get("likes"))


# --- LEARN -----------------------------------------------------------------

def _history_text(history: dict) -> str:
    """Render the interaction history the distiller reasons over."""
    lines: list[str] = []
    if history.get("product"):
        lines.append(f"Product: {history['product']}")
    if history.get("brandTone"):
        lines.append(f"Declared brand tone: {history['brandTone']}")
    if history.get("customerNotes"):
        lines.append(f"Customer's own description: {history['customerNotes']}")
    fb = history.get("feedbackNotes")
    if fb:
        fb = "; ".join(str(x) for x in fb) if isinstance(fb, list) else str(fb)
        lines.append(f"Pre-delivery tweaks they asked for: {fb}")
    for rev in history.get("revisions") or []:
        req = str(rev.get("request", "")).strip()
        chg = str(rev.get("whatChanged", "")).strip()
        if req or chg:
            lines.append(f"Revision — they asked: {req!r}; we changed: {chg!r}")
    for ack in history.get("acks") or []:
        if str(ack).strip():
            lines.append(f"Reaction to the cut: {str(ack).strip()!r}")
    for extra in history.get("notes") or []:
        if str(extra).strip():
            lines.append(str(extra).strip())
    return "\n".join(lines)


def distill(history: dict, key: str) -> dict | None:
    """LLM-extract durable preferences from one job's interaction history."""
    text = _history_text(history)
    if not text.strip() or sb_mod is None:
        return None
    system = (
        "You maintain a durable STYLE PROFILE for a repeat customer of an automated "
        "launch-trailer service. From the interaction history, extract ONLY preferences "
        "the customer actually expressed or that their edits/reactions clearly imply — "
        "never invent. Return JSON with EXACTLY these keys: "
        "{\"hookStyle\": string|null, \"paletteLeanings\": string|null, \"tone\": string|null, "
        "\"doNots\": [string], \"likes\": [string]}. "
        "hookStyle = how they like the opening line (e.g. 'benefit-led, time-saving angle'). "
        "paletteLeanings = color/visual leanings if stated. tone = voice they prefer. "
        "doNots = things they rejected, removed, or asked to avoid. likes = things they "
        "explicitly praised or asked for. Each list item is a short phrase. Use null / [] "
        "for anything not genuinely evidenced. Do NOT restate generic brand copy as a preference."
    )
    user = "INTERACTION HISTORY:\n" + text + "\n\nExtract the durable preferences now."
    try:
        raw, _usage = sb_mod.call_openai(DISTILL_MODEL, key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
    except Exception as e:  # noqa: BLE001
        log(f"distill LLM failed ({e})")
        return None
    if not isinstance(raw, dict):
        return None
    out = _empty()
    for k in _SCALARS:
        v = raw.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()[:120]
    for k in _LISTS:
        out[k] = [str(x).strip() for x in (raw.get(k) or []) if str(x).strip()][:12]
    return out if _has_signal(out) else None


def _read_company_prefs(company: str) -> dict:
    if profiles is None or not company:
        return {}
    path = profiles._company_path(company)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
            if isinstance(doc, dict):
                return doc.get("preferences") or {}
        except (OSError, ValueError):
            pass
    return {}


def _write_company_prefs(company: str, prefs: dict) -> None:
    if profiles is None or not company:
        return
    path = profiles._company_path(company)
    doc: dict = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                loaded = json.load(fh)
            if isinstance(loaded, dict):
                doc = loaded
        except (OSError, ValueError):
            doc = {}
    doc["preferences"] = prefs
    doc.setdefault("company", company)
    profiles._atomic_write(path, doc)


def distill_and_store(email: str | None, company: str | None, history: dict) -> dict | None:
    """Distill preferences from a closed job's history and MERGE them into the email
    and company dossiers. Returns the merged preferences (or None). Never raises."""
    try:
        if sb_mod is None or profiles is None:
            return None
        key = sb_mod.load_env_key("OPENAI_API_KEY")
        if not key:
            return None
        new = distill(history, key)
        if not new:
            log("no durable preference signal in history — nothing to store")
            return None
        merged = None
        if email:
            prof = profiles.read_profile(email)
            merged = merge_preferences(prof.get("preferences"), new)
            profiles.update_profile(email, {"preferences": merged})
            log(f"stored preferences on {email}: {json.dumps(merged, ensure_ascii=False)}")
        if company:
            merged_c = merge_preferences(_read_company_prefs(company), new)
            _write_company_prefs(company, merged_c)
            merged = merged or merged_c
            log(f"stored preferences on company '{company}'")
        return merged
    except Exception as e:  # noqa: BLE001 — best-effort; never fail the caller
        log(f"distill_and_store skipped: {e}")
        return None


# --- RECALL / APPLY --------------------------------------------------------

def load_preferences(email: str | None = None, company: str | None = None) -> dict:
    """Merged preferences for this customer (email dossier + company dossier)."""
    prefs = _empty()
    try:
        if profiles is not None and email:
            prefs = merge_preferences(prefs, profiles.read_profile(email).get("preferences"))
        if company:
            prefs = merge_preferences(prefs, _read_company_prefs(company))
    except Exception:  # noqa: BLE001
        pass
    return prefs


def load_prompt_block(email: str | None = None, company: str | None = None) -> str:
    """A short instruction folded into the storyboard prompt, or '' if we know
    nothing about this customer yet."""
    prefs = load_preferences(email, company)
    if not _has_signal(prefs):
        return ""
    bits: list[str] = []
    if prefs.get("hookStyle"):
        bits.append(f"prefers hooks that are {prefs['hookStyle']}")
    if prefs.get("tone"):
        bits.append(f"prefers a {prefs['tone']} tone")
    if prefs.get("paletteLeanings"):
        bits.append(f"leans toward {prefs['paletteLeanings']} visually")
    if prefs.get("likes"):
        bits.append("has previously liked: " + "; ".join(prefs["likes"][:5]))
    if prefs.get("doNots"):
        bits.append("has asked us to AVOID: " + "; ".join(prefs["doNots"][:5]))
    if not bits:
        return ""
    return ("This is a returning customer. Honor their known preferences from past "
            "trailers (do not contradict them): " + "; ".join(bits) + ".")


def _main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="LaunchReel preference distiller")
    sub = ap.add_subparsers(dest="cmd")
    d = sub.add_parser("distill", help="distill from a history JSON file/string and store")
    d.add_argument("--email", default=None)
    d.add_argument("--company", default=None)
    d.add_argument("--history", required=True, help="JSON string or @path of the history dict")
    s = sub.add_parser("show", help="show a customer's stored preferences / prompt block")
    s.add_argument("--email", default=None)
    s.add_argument("--company", default=None)
    args = ap.parse_args(argv)
    if args.cmd == "distill":
        raw = args.history
        if raw.startswith("@"):
            with open(raw[1:], encoding="utf-8") as fh:
                raw = fh.read()
        history = json.loads(raw)
        out = distill_and_store(args.email, args.company, history)
        print(json.dumps({"stored": out}, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "show":
        print(json.dumps({
            "preferences": load_preferences(args.email, args.company),
            "promptBlock": load_prompt_block(args.email, args.company),
        }, ensure_ascii=False, indent=2))
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
