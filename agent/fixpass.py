#!/usr/bin/env python3
"""fixpass.py — the LaunchReel rubric-driven auto-fix pass.

When the vision rig (eval/scripts/frame-qa.py) AUTO-FAILS a rendered trailer, this
takes the rig's scorecard (the per-dimension scores + the judge's frame-level
evidence) plus the CURRENT storyboard.json and asks an LLM for the SMALLEST
storyboard edit that removes ONLY the cited defects — then re-render/re-rig.

It is the render-loop sibling of agent/feedback.py's customer-revision pass, but
driven by the rubric evidence instead of a customer note, and with a slightly
wider (still tightly bounded) edit surface that matches the rubric's own fixes:

  - off-palette scene background      -> set an explicit brand-safe brand.colors value
  - smeared/gibberish text            -> drop the offending scene's bgVideoPath (never
                                         send text/UI through gen-video — AGENTS.md)
  - hallucinated / fake-looking UI    -> drop the bad bgVideoPath and/or switch the
                                         scene's screenshotPaths to a real captured file
  - bad screenshot crop               -> switch screenshotPaths to a different real file

What it can NEVER change (structurally enforced by merge_fix, regardless of what
the model returns): scene order, scene types, durations, the watermark, brand.name,
brand.url, and the audio block. So the file that reaches the renderer on attempt 2
is always schema-valid and still the same six-scene contract.

Reuses agent/storyboard.py for the OpenAI caller, hex/clamp helpers, schema load,
and schema/semantic validation — the fix is not accepted unless it validates.

Usable two ways:
  * imported by agent/worker.py:  fix_from_scorecard(storyboard, scorecard, ...)
  * standalone (for the proof run / debugging):
      fixpass.py --storyboard sb.json --scorecard card.json --assets <bundle> \
                 --out fixed.json [--model gpt-5-mini] [--tier teaser|trailer]
"""
import argparse
import copy
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENT = os.path.join(REPO, "agent")
if AGENT not in sys.path:
    sys.path.insert(0, AGENT)
import storyboard as sb_mod  # noqa: E402 — reuse OpenAI caller + validation

STORYBOARD_SCHEMA = os.path.join(REPO, "render", "storyboard.schema.json")
DEFAULT_MODEL = os.environ.get("FIXPASS_MODEL", "gpt-5-mini")
# Dimensions the still-rig can auto-fail on (mirrors frame-qa.AUTO_FAIL_DIMS).
AUTO_FAIL_DIMS = ("text_legibility", "real_ui_truthfulness")


def log(msg: str) -> None:
    print(f"[fixpass] {msg}", flush=True)


# --- evidence digest -------------------------------------------------------

def scorecard_digest(scorecard: dict) -> str:
    """A compact, model-legible summary of WHAT failed and WHY, straight from the
    rig scorecard: the failing/weak dimensions, their scores, and the judge's
    frame-level observations. Only this drives the edit — we never let the fix
    pass invent defects the rig didn't cite."""
    scores = scorecard.get("scores", {}) or {}
    evidence = scorecard.get("evidence", []) or []
    reasons = scorecard.get("verdict_reasons", []) or []

    # Rank dimensions worst-first so the model fixes the auto-fails before nits.
    ranked = sorted(scores.items(), key=lambda kv: (kv[1] or {}).get("score", 5))
    ev_by_dim: dict[str, list[str]] = {}
    for e in evidence:
        d = e.get("dimension")
        if not d:
            continue
        ev_by_dim.setdefault(d, []).append(
            f"frame {e.get('frame_index', '?')}: {e.get('observation', '').strip()}"
        )

    lines = [f"Rig verdict: {scorecard.get('verdict', '?')} "
             f"(model gut: {scorecard.get('model_verdict', '?')})."]
    if reasons:
        lines.append("Gate reasons: " + "; ".join(str(r) for r in reasons))
    lines.append("")
    lines.append("Per-dimension scores (1-5) and the judge's frame evidence:")
    for dim, sc in ranked:
        score = (sc or {}).get("score", "?")
        flag = "  <-- AUTO-FAIL" if dim in AUTO_FAIL_DIMS and isinstance(score, int) and score <= 2 else \
               ("  <-- weak" if isinstance(score, int) and score < 3 else "")
        lines.append(f"- {dim}: {score}{flag}")
        for obs in ev_by_dim.get(dim, [])[:3]:
            lines.append(f"    {obs}")
    return "\n".join(lines)


def failing_dims(scorecard: dict) -> list[str]:
    scores = scorecard.get("scores", {}) or {}
    out = []
    for d, sc in scores.items():
        s = (sc or {}).get("score")
        if isinstance(s, int) and (s <= 2 if d in AUTO_FAIL_DIMS else s < 3):
            out.append(d)
    return out


# --- prompt ----------------------------------------------------------------

def build_fix_messages(original: dict, scorecard: dict, screenshots: list[str]) -> list[dict]:
    digest = scorecard_digest(scorecard)
    shot_list = ", ".join(screenshots) if screenshots else "(no real screenshots available)"
    system = (
        "You are the LaunchReel Strategist running an automated QUALITY FIX pass on a "
        "30-second SaaS launch-trailer storyboard. A vision QA rig scored the rendered "
        "trailer and FAILED it. You are given the current storyboard JSON and the rig's "
        "scorecard (per-dimension scores + the judge's frame-level evidence). Make the "
        "SMALLEST set of edits that removes ONLY the cited defects — change nothing the "
        "rig did not flag.\n\n"
        "You may ONLY edit:\n"
        "  - brand.colors (hex values) — fix an off-brand / off-palette background by "
        "setting a deliberate, brand-consistent bg/accent/ink.\n"
        "  - a scene's headline / sub / metrics / quote (keep headlines 3-7 words).\n"
        "  - a scene's screenshotPaths — you may ONLY use one of the available real "
        "screenshot files listed below, or set it to [] to drop a bad/blurry image so "
        "the scene degrades to a clean brand-color field.\n"
        "  - a scene's bgVideoPath — you may ONLY REMOVE it (set to \"\" or omit). Smeared "
        "text and hallucinated/fake UI come from gen-video backgrounds; dropping the "
        "bgVideoPath is the correct fix. NEVER add or change a bgVideoPath to a new value.\n\n"
        "You must NEVER change: scene order or types, durations, the watermark, "
        "brand.name, brand.url, the audio block, or add new scenes. Do not invent "
        "metrics, testimonials, screenshot filenames, or video paths. Preserve every "
        "field the evidence does not implicate — return untouched copy verbatim."
    )
    user = (
        "RIG SCORECARD (this is the ground truth for what to fix):\n"
        + digest
        + "\n\nAVAILABLE REAL SCREENSHOT FILES (the only values allowed in screenshotPaths):\n"
        + shot_list
        + "\n\nCURRENT storyboard JSON:\n"
        + json.dumps(original, ensure_ascii=False, indent=2)
        + "\n\nReturn ONE JSON object with EXACTLY these two keys:\n"
        '{ "storyboard": <the full edited storyboard, same schema>, '
        '"whatChanged": "<one short sentence naming the defect(s) you fixed and how>" }'
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# --- constrained merge -----------------------------------------------------

def merge_fix(original: dict, edited: dict, screenshots: list[str]) -> dict:
    """Rebuild the revised storyboard from the ORIGINAL, applying only the allowed
    fields from the LLM's edit. Structurally guarantees scene order/types,
    durations, watermark, brand.name/url and audio are untouched. Extends
    feedback.merge_allowed with screenshotPaths (real-files-only) + bgVideoPath
    REMOVAL, which the rubric's auto-fail fixes need."""
    out = copy.deepcopy(original)
    shots = set(screenshots or [])

    # brand.colors — only valid hex overrides.
    edited_colors = ((edited.get("brand") or {}).get("colors") or {})
    out_colors = out.setdefault("brand", {}).setdefault("colors", {})
    for k, val in edited_colors.items():
        if k in ("bg", "accent", "ink", "paper", "accent2", "accent3", "accent4") \
                and isinstance(val, str) and sb_mod.HEX_RE.match(val):
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

        # screenshotPaths — accept only real files; an explicit [] drops a bad image.
        if "screenshotPaths" in es:
            sp = es.get("screenshotPaths")
            if isinstance(sp, list):
                keep = [p for p in sp if isinstance(p, str) and p in shots]
                if keep:
                    sc["screenshotPaths"] = keep[:1] if t in ("tour_a", "tour_b", "problem") else keep
                elif sp == [] or all(p not in shots for p in sp):
                    # model asked to clear it (or every path was invalid) -> drop it
                    sc.pop("screenshotPaths", None)

        # bgVideoPath — REMOVAL only. Any falsy / cleared value drops it; a new
        # non-empty value is ignored (never route text/UI through gen-video).
        if "bgVideoPath" in es:
            bv = es.get("bgVideoPath")
            if not (isinstance(bv, str) and bv.strip()):
                sc.pop("bgVideoPath", None)
        elif es.get("_dropBgVideo"):  # tolerate an explicit drop flag if the model uses one
            sc.pop("bgVideoPath", None)

    return out


def summarize_fix(original: dict, merged: dict) -> str:
    bits: list[str] = []
    oc = ((original.get("brand") or {}).get("colors") or {})
    mc = ((merged.get("brand") or {}).get("colors") or {})
    for k in ("bg", "accent", "ink", "accent2", "paper"):
        if mc.get(k) and oc.get(k) != mc.get(k):
            bits.append(f"{k} → {mc[k]}")
    for a, b in zip(original.get("scenes", []), merged.get("scenes", [])):
        if a.get("bgVideoPath") and not b.get("bgVideoPath"):
            bits.append(f"dropped {b.get('type')} bgVideo")
        if (a.get("screenshotPaths") or []) != (b.get("screenshotPaths") or []):
            bits.append(f"{b.get('type')} screenshot changed")
        if (a.get("headline") or "") != (b.get("headline") or ""):
            bits.append(f"{b.get('type')} headline")
    return "; ".join(bits[:5]) or "Applied targeted fixes for the rig-flagged defects."


# --- public entrypoint -----------------------------------------------------

def fix_from_scorecard(storyboard: dict, scorecard: dict, screenshots: list[str],
                       tier: str, model: str = DEFAULT_MODEL,
                       key: str | None = None) -> tuple[dict | None, str, dict]:
    """Return (revised_storyboard, what_changed, meta). revised is None if no key,
    the model fails, or the edit won't validate — the caller then escalates."""
    meta = {"model": model, "attempts": [], "failing_dims": failing_dims(scorecard)}
    key = key or sb_mod.load_env_key("OPENAI_API_KEY")
    if not key:
        return None, "no OPENAI_API_KEY", {**meta, "model": None}

    schema = sb_mod.load_schema(STORYBOARD_SCHEMA)
    # tier from the storyboard's own watermark so the semantic check is self-consistent.
    tier = tier or ("teaser" if storyboard.get("watermark") else "trailer")
    messages = build_fix_messages(storyboard, scorecard, screenshots)

    errors_feedback = None
    for attempt in (1, 2):
        msgs = list(messages)
        if errors_feedback:
            msgs.append({"role": "user", "content":
                         "Your previous JSON had these problems — fix them and return the "
                         "full corrected object:\n- " + "\n- ".join(errors_feedback)})
        try:
            raw, usage = sb_mod.call_openai(model, key, msgs)
        except Exception as e:  # noqa: BLE001 — API/parse error: try next attempt
            detail = e.read().decode()[:200] if hasattr(e, "read") else str(e)
            log(f"fix LLM call failed (attempt {attempt}): {detail}")
            meta["attempts"].append({"attempt": attempt, "error": detail[:160]})
            errors_feedback = None
            continue
        edited = raw.get("storyboard", raw)
        what = str(raw.get("whatChanged", "")).strip()
        merged = merge_fix(storyboard, edited, screenshots)
        errs = sb_mod.schema_errors(merged, schema) + sb_mod.semantic_errors(merged, screenshots, tier)
        meta["attempts"].append({"attempt": attempt, "errors": errs, "usage": usage})
        if not errs:
            return merged, (what or summarize_fix(storyboard, merged)), {**meta, "usage": usage}
        log(f"fix attempt {attempt}: {len(errs)} issue(s) after merge: {errs[:3]}")
        errors_feedback = errs
    return None, "fix failed validation", meta


# --- standalone ------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel rubric-driven storyboard fix pass")
    ap.add_argument("--storyboard", required=True, help="current storyboard.json")
    ap.add_argument("--scorecard", required=True, help="frame-qa scorecard.json (the failure)")
    ap.add_argument("--assets", default=None, help="bundle dir (for available screenshots)")
    ap.add_argument("--out", required=True, help="write the fixed storyboard here")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--tier", default=None, choices=[None, "teaser", "trailer", "pack"])
    args = ap.parse_args()

    storyboard = sb_mod.read_json(args.storyboard)
    scorecard = sb_mod.read_json(args.scorecard)
    if not storyboard or not scorecard:
        log("ERROR: could not read storyboard or scorecard")
        return 1
    screenshots = []
    if args.assets:
        manifest = sb_mod.read_json(os.path.join(args.assets, "manifest.json"))
        screenshots = sb_mod.available_screenshots(args.assets, manifest)

    revised, what, meta = fix_from_scorecard(
        storyboard, scorecard, screenshots, args.tier, model=args.model)
    if revised is None:
        log(f"no fix produced: {what}")
        print(json.dumps({"ok": False, "reason": what, "meta": meta}))
        return 2
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(revised, fh, indent=2)
    log(f"wrote fixed storyboard -> {args.out}  ({what})")
    print(json.dumps({"ok": True, "whatChanged": what, "out": os.path.abspath(args.out),
                      "failing_dims": meta.get("failing_dims"), "model": meta.get("model")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
