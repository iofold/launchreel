#!/usr/bin/env python3
"""video-compare.py — score TWO trailers on the LaunchReel rubric and pick a winner.

The demo trick: a client emails reel@ctxmill.com two videos (attachments or links)
and gets back a per-criterion comparison + an overall winner. This is the scoring
engine behind that: it reuses the SAME still-frame scoring core as the delivery
gate (eval/scripts/frame-qa.py) on each video, then runs one comparative LLM pass
to explain the head-to-head.

Design:
  - Per-video scoring is frame-qa's core, imported (not forked): extract_frames ->
    build_prompt -> call_gemini -> compute_verdict. So a trailer is judged here
    exactly as it is at the delivery gate.
  - Per-dimension and overall WINNERS are computed DETERMINISTICALLY from the rig's
    numeric scores (higher wins; ties flagged) — auditable, not a model's whim.
  - One Gemini text pass turns the two scorecards into grounded per-criterion "why"
    lines + a one-sentence overall summary (narrative only; it never sets the winner).
  - Brand fidelity is gate-grade only with brand ground truth (see eval/rubric.md).
    Without --brand-json the overall mean is taken over the three brand-agnostic
    dims (text legibility, real-UI truthfulness, CTA/watermark) and a note says so;
    brand_fidelity is still shown, marked advisory.

Inputs may be local paths OR http(s) URLs (mp4/webm/mov) — URLs are downloaded to a
temp file first. Emits a JSON result (email-ready: labelA/labelB/winner/scoreA/
scoreB/summary/perDimension[]/brandNote) plus a plain-text table on stdout.

Usage:
  video-compare.py --a <path|url> --b <path|url> [--a-label L] [--b-label L] \
     --out compare.json [--frames 8] [--model gemini-2.5-flash] \
     [--tier free|paid] [--brand-json PATH] [--a-url URL] [--b-url URL] \
     [--env-file PATH] [--html-out compare.html]

Deps: Python 3 stdlib + ffmpeg/ffprobe (via frame-qa). Key: GEMINI_API_KEY.
"""
import argparse
import importlib.util
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FRAME_QA_PATH = os.path.join(HERE, "frame-qa.py")


def _load_frame_qa():
    """Import frame-qa.py (hyphenated filename) as a module so we reuse its exact
    scoring core rather than reimplementing it."""
    spec = importlib.util.spec_from_file_location("frame_qa", FRAME_QA_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fq = _load_frame_qa()
DIM_LABEL = {
    "brand_fidelity": "Brand fidelity",
    "text_legibility": "Text legibility",
    "real_ui_truthfulness": "Real-UI truthfulness",
    "cta_watermark": "CTA / watermark",
}
BRAND_AGNOSTIC_DIMS = ["text_legibility", "real_ui_truthfulness", "cta_watermark"]


def log(msg: str) -> None:
    print(f"[video-compare] {msg}", flush=True)


# --- input handling --------------------------------------------------------

def _ext_from(url: str, content_type: str = "") -> str:
    for e in (".mp4", ".webm", ".mov", ".m4v"):
        if url.lower().split("?")[0].endswith(e):
            return e
    ct = (content_type or "").lower()
    if "webm" in ct:
        return ".webm"
    if "quicktime" in ct or "mov" in ct:
        return ".mov"
    return ".mp4"


def resolve_video(src: str, workdir: str, label: str) -> str:
    """Return a local path for src (download if it's an http(s) URL)."""
    if src.startswith("http://") or src.startswith("https://"):
        log(f"downloading {label}: {src}")
        req = urllib.request.Request(src, headers={"User-Agent": "launchreel-video-compare"})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                ct = res.headers.get("Content-Type", "")
                data = res.read()
        except urllib.error.HTTPError as e:
            sys.exit(f"download failed for {label} ({src}): HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            sys.exit(f"download failed for {label} ({src}): {e}")
        path = os.path.join(workdir, f"{label}{_ext_from(src, ct)}")
        with open(path, "wb") as fh:
            fh.write(data)
        if os.path.getsize(path) == 0:
            sys.exit(f"downloaded 0 bytes for {label} ({src})")
        log(f"{label}: {len(data)//1024} KB -> {path}")
        return path
    if not os.path.exists(src):
        sys.exit(f"{label} not found: {src}")
    return src


# --- per-video scoring (frame-qa core) -------------------------------------

def score_one(video: str, label: str, key: str, model: str, frames: int,
              brand: dict | None, tier: str, expect_url: str | None) -> dict:
    with tempfile.TemporaryDirectory() as fdir:
        frame_list = fq.extract_frames(video, frames, fdir)
        prompt = fq.build_prompt(brand, tier, expect_url)
        result = fq.call_gemini(model, key, prompt, frame_list)
    verdict, reasons = fq.compute_verdict(result["scores"])
    scores = {d: result["scores"][d]["score"] for d in fq.STILL_DIMS}
    log(f"{label}: " + "  ".join(f"{d}={scores[d]}" for d in fq.STILL_DIMS)
        + f"  verdict={verdict}")
    return {
        "label": label,
        "video": video,
        "scores": result["scores"],
        "evidence": result["evidence"],
        "verdict": verdict,
        "verdict_reasons": reasons,
        "model_verdict": result.get("model_verdict"),
        "notes": result.get("notes", ""),
        "usage": result.get("_usage", {}),
    }


# --- comparative synthesis (grounded narrative only) -----------------------

def gemini_text_json(model: str, key: str, prompt: str, schema: dict) -> dict:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0.0,
        },
    }
    url = fq.GEMINI_URL.format(model=model, key=key)
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as res:
        payload = json.load(res)
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(fq._strip_fences(text))
    parsed["_usage"] = payload.get("usageMetadata", {})
    return parsed


def comparative_why(a: dict, b: dict, labelA: str, labelB: str, scored_dims: list[str],
                    mean_a: float, mean_b: float, winner_label: str,
                    model: str, key: str) -> dict:
    """One text pass: grounded per-dimension 'why' + an overall summary. Winners are
    NOT the model's to choose — they are the numeric means computed here and PASSED
    IN; the model only explains, so its summary always agrees with the scoreboard."""
    def digest(card: dict, lbl: str) -> str:
        lines = [f"{lbl}:"]
        for d in fq.STILL_DIMS:
            lines.append(f"  {d}={card['scores'][d]['score']} — "
                         + "; ".join(e["observation"] for e in card["evidence"]
                                     if e.get("dimension") == d)[:300])
        lines.append(f"  overall model_verdict={card.get('model_verdict')} notes={card.get('notes','')[:200]}")
        return "\n".join(lines)

    verdict_line = (
        f"The winner is already decided by the mean score over {', '.join(scored_dims)}: "
        f"{labelA}={mean_a} vs {labelB}={mean_b} -> WINNER: {winner_label}. "
        "Your summary MUST be consistent with this outcome (do not crown the other video)."
    )
    prompt = (
        "You are comparing two AI-generated SaaS launch trailers that were each scored "
        "1-5 on the same rubric dimensions by a vision QA rig. Using ONLY the scores and "
        "the judge's evidence below, write a short, concrete comparison. For each "
        "dimension give a one-clause 'why' explaining how the two differ (cite the "
        "concrete observation, e.g. 'A's CTA URL is crisp; B's headline is soft'). Then "
        "write a single-sentence overall summary that JUSTIFIES the decided winner "
        "below. Do not invent details not present in the evidence.\n\n"
        f"{verdict_line}\n\n"
        f"VIDEO A = \"{labelA}\"\n{digest(a, labelA)}\n\n"
        f"VIDEO B = \"{labelB}\"\n{digest(b, labelB)}\n\n"
        f"Dimensions that count toward the score: {', '.join(scored_dims)} "
        "(brand_fidelity is advisory if not listed).\n"
        "Return JSON: { perDimension:[{dimension, why}], overall:{summary} }."
    )
    schema = {
        "type": "object",
        "properties": {
            "perDimension": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "dimension": {"type": "string", "enum": fq.STILL_DIMS},
                        "why": {"type": "string"},
                    },
                    "required": ["dimension", "why"],
                },
            },
            "overall": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        },
        "required": ["perDimension", "overall"],
    }
    try:
        return gemini_text_json(model, key, prompt, schema)
    except Exception as e:  # noqa: BLE001 — narrative is best-effort; numbers still stand
        log(f"comparative narrative pass failed ({e}); falling back to numeric-only whys")
        return {"perDimension": [], "overall": {"summary": ""}}


# --- assembly --------------------------------------------------------------

def winner_of(a_val: int, b_val: int) -> str:
    if a_val > b_val:
        return "A"
    if b_val > a_val:
        return "B"
    return "tie"


def compute_overall(a: dict, b: dict, has_brand: bool) -> tuple[list[str], float, float, str]:
    """Deterministic scoreboard: the mean over the dims that COUNT (all four with a
    brand ground truth; the three brand-agnostic dims without one) decides the
    winner. Returns (scored_dims, mean_a, mean_b, winner)."""
    scored_dims = fq.STILL_DIMS if has_brand else BRAND_AGNOSTIC_DIMS
    mean_a = round(sum(a["scores"][d]["score"] for d in scored_dims) / len(scored_dims), 2)
    mean_b = round(sum(b["scores"][d]["score"] for d in scored_dims) / len(scored_dims), 2)
    winner = winner_of(round(mean_a * 100), round(mean_b * 100))
    return scored_dims, mean_a, mean_b, winner


def assemble(a: dict, b: dict, labelA: str, labelB: str, has_brand: bool,
             scored_dims: list[str], mean_a: float, mean_b: float, overall_winner: str,
             why_pass: dict) -> dict:
    why_by_dim = {w["dimension"]: w.get("why", "")
                  for w in (why_pass.get("perDimension") or []) if w.get("dimension")}

    per_dim = []
    for d in fq.STILL_DIMS:
        av = a["scores"][d]["score"]
        bv = b["scores"][d]["score"]
        why = why_by_dim.get(d, "")
        if d == "brand_fidelity" and not has_brand:
            why = (why + " " if why else "") + "(advisory — no brand ground truth)"
        per_dim.append({
            "dimension": d,
            "a": av,
            "b": bv,
            "winner": winner_of(av, bv),
            "why": why.strip(),
            "counted": d in scored_dims,
        })

    summary = (why_pass.get("overall") or {}).get("summary", "").strip()
    if not summary:
        wl = labelA if overall_winner == "A" else labelB if overall_winner == "B" else "Neither"
        summary = (f"{wl} scores higher on the rubric ({labelA} {mean_a} vs {labelB} {mean_b})."
                   if overall_winner != "tie" else
                   f"Dead heat: both trailers mean {mean_a} across the scored dimensions.")

    brand_note = None
    if not has_brand:
        brand_note = ("No brand ground-truth was supplied, so brand fidelity is advisory "
                      "(internal consistency only) and excluded from the overall score; the "
                      "winner is decided on text legibility, real-UI truthfulness, and CTA/watermark.")

    return {
        "labelA": labelA,
        "labelB": labelB,
        "winner": overall_winner,
        "scoreA": mean_a,
        "scoreB": mean_b,
        "summary": summary,
        "scoredDims": scored_dims,
        "perDimension": per_dim,
        "brandNote": brand_note,
        "a": a,
        "b": b,
    }


def text_table(result: dict) -> str:
    la, lb = result["labelA"], result["labelB"]
    w = result["winner"]
    wl = la if w == "A" else lb if w == "B" else "TIE"
    rows = [f"Trailer face-off: {la}  vs  {lb}",
            f"Winner: {wl}   ({la} {result['scoreA']}  vs  {lb} {result['scoreB']})",
            "",
            f"{'Criterion':<24}{la[:12]:>13}{lb[:12]:>13}   Edge"]
    rows.append("-" * 70)
    for r in result["perDimension"]:
        edge = la if r["winner"] == "A" else lb if r["winner"] == "B" else "tie"
        star = "" if r["counted"] else " (advisory)"
        rows.append(f"{DIM_LABEL[r['dimension']]+star:<24}{r['a']:>13}{r['b']:>13}   {edge}")
        if r["why"]:
            rows.append(f"    ↳ {r['why']}")
    rows += ["", f"Summary: {result['summary']}"]
    if result.get("brandNote"):
        rows += ["", result["brandNote"]]
    return "\n".join(rows)


def html_table(result: dict) -> str:
    la, lb = result["labelA"], result["labelB"]
    body = ["<table border=1 cellpadding=6 cellspacing=0 style='border-collapse:collapse;font-family:sans-serif'>",
            f"<tr><th>Criterion</th><th>{la}</th><th>{lb}</th><th>Edge</th><th>Why</th></tr>"]
    for r in result["perDimension"]:
        edge = la if r["winner"] == "A" else lb if r["winner"] == "B" else "tie"
        name = DIM_LABEL[r["dimension"]] + ("" if r["counted"] else " (advisory)")
        body.append(f"<tr><td>{name}</td><td align=center>{r['a']}</td>"
                    f"<td align=center>{r['b']}</td><td>{edge}</td><td>{r['why']}</td></tr>")
    body.append("</table>")
    wl = la if result["winner"] == "A" else lb if result["winner"] == "B" else "Tie"
    return (f"<p><b>Winner: {wl}</b> ({la} {result['scoreA']} vs {lb} {result['scoreB']})</p>"
            + "\n".join(body) + f"<p>{result['summary']}</p>")


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare two trailers on the LaunchReel rubric")
    ap.add_argument("--a", required=True, help="video A path or http(s) url")
    ap.add_argument("--b", required=True, help="video B path or http(s) url")
    ap.add_argument("--a-label", default="Video A")
    ap.add_argument("--b-label", default="Video B")
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--model", default=fq.DEFAULT_MODEL)
    ap.add_argument("--tier", choices=["free", "paid"], default="paid")
    ap.add_argument("--brand-json", default=None)
    ap.add_argument("--a-url", default=None, help="expected CTA url for A (optional)")
    ap.add_argument("--b-url", default=None, help="expected CTA url for B (optional)")
    ap.add_argument("--env-file", default=fq.DEFAULT_ENV)
    ap.add_argument("--html-out", default=None)
    args = ap.parse_args()

    key = fq.load_api_key(args.env_file)
    brand = None
    if args.brand_json and os.path.exists(args.brand_json):
        with open(args.brand_json) as f:
            brand = json.load(f)
    has_brand = brand is not None

    with tempfile.TemporaryDirectory() as dl:
        va = resolve_video(args.a, dl, "a")
        vb = resolve_video(args.b, dl, "b")
        a = score_one(va, args.a_label, key, args.model, args.frames, brand, args.tier, args.a_url)
        b = score_one(vb, args.b_label, key, args.model, args.frames, brand, args.tier, args.b_url)

    scored_dims, mean_a, mean_b, overall_winner = compute_overall(a, b, has_brand)
    winner_label = args.a_label if overall_winner == "A" else args.b_label if overall_winner == "B" else "Tie"
    why_pass = comparative_why(a, b, args.a_label, args.b_label, scored_dims,
                               mean_a, mean_b, winner_label, args.model, key)
    result = assemble(a, b, args.a_label, args.b_label, has_brand,
                      scored_dims, mean_a, mean_b, overall_winner, why_pass)
    result["usage"] = {
        "a": a.get("usage", {}), "b": b.get("usage", {}),
        "comparative": why_pass.get("_usage", {}),
    }
    result["table_text"] = text_table(result)
    result["table_html"] = html_table(result)

    with open(args.out, "w") as f:
        json.dump(result, f, indent=2)
    if args.html_out:
        with open(args.html_out, "w") as f:
            f.write(result["table_html"])

    print(result["table_text"])
    print(f"\n[video-compare] result -> {args.out}")
    print(json.dumps({"ok": True, "winner": result["winner"], "scoreA": result["scoreA"],
                      "scoreB": result["scoreB"], "out": os.path.abspath(args.out)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
