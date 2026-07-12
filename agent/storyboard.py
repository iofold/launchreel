#!/usr/bin/env python3
"""storyboard.py — the LaunchReel Strategist (storyboard writer).

Turns a Scout bundle (brief.json + screenshots) plus the job's fields into the
ONE artifact the deterministic renderer consumes: a `storyboard.json` that is
STRICTLY valid against render/storyboard.schema.json. Also writes a matching
`vo.txt` — a ~60-80 word narration script for the six scenes.

The LLM never writes render code (see AGENTS.md pipeline contract). It writes
storyboard content only, inside a fixed 6-scene contract:

    hook · problem · tour_a · tour_b · social_proof · cta

Design guarantees (why the renderer can trust the output):
  - We ask the model for {"storyboard": <schema object>, "voiceover": "<script>"}
    with response_format=json_object, then VALIDATE storyboard against the JSON
    Schema (python jsonschema) + semantic checks, and RETRY ONCE with the errors.
  - Whatever the model returns, a deterministic `normalize()` pass pins the fixed
    scene order + durations, drops screenshotPaths that don't exist on disk,
    forces watermark = (tier == teaser), and repairs the brand palette. So the
    file that reaches the renderer is valid even if the model drifts.
  - If the primary model fails entirely, we fall back to gpt-4o-mini, then to a
    fully deterministic hand-built storyboard — the pipeline never hard-blocks.

Usage:
  storyboard.py --bundle-dir .tmp/scout/<jid> \
                --product-name Linear --one-liner "..." --url linear.app \
                --tier teaser [--out storyboard.json] [--vo-out vo.txt] \
                [--model gpt-5-mini] [--schema render/storyboard.schema.json]

Env: OPENAI_API_KEY (required; never printed). Reads .env/.env.local as a fallback.
Exit 0 on a valid storyboard (LLM or deterministic fallback); 1 only on a
usage/IO error (a missing key still yields the deterministic fallback? no —
without a key we still build the deterministic storyboard and exit 0).
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
SCENE_ORDER = ["hook", "problem", "tour_a", "tour_b", "social_proof", "cta"]
CANON_DURATIONS = {"hook": 5, "problem": 5, "tour_a": 6, "tour_b": 6, "social_proof": 5, "cta": 3}
HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
# Rough per-1M-token USD pricing for cost reporting (input, output).
PRICING = {
    "gpt-5-mini": (0.25, 2.0),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5": (1.25, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.0),
    "gpt-4.1-mini": (0.40, 1.60),
}
DEFAULT_PALETTE = {"bg": "#F4F5F7", "paper": "#FFFFFF", "ink": "#16161C", "accent": "#5E6AD2"}


def log(msg: str) -> None:
    print(f"[storyboard] {msg}", flush=True)


# --- env -------------------------------------------------------------------

def load_env_key(name: str) -> str:
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


# --- inputs ----------------------------------------------------------------

def read_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def available_screenshots(bundle_dir: str, manifest: dict | None) -> list[str]:
    """Real screenshot files present on disk, in a sensible tour order.

    Prefers the manifest's declared screenshots (desktop-hero, desktop-full,
    mobile), then any hero-fallback.* — only files that actually exist.
    """
    ordered: list[str] = []
    seen = set()

    def add(name: str) -> None:
        if name and name not in seen and os.path.exists(os.path.join(bundle_dir, name)):
            ordered.append(name)
            seen.add(name)

    if manifest:
        for s in manifest.get("screenshots", []) or []:
            if isinstance(s, dict):
                add(str(s.get("file", "")))
        files = manifest.get("files", {}) or {}
        if isinstance(files.get("heroFallback"), str):
            add(files["heroFallback"])
    # Fall back to scanning known names if the manifest was sparse.
    for name in ("desktop-hero.png", "desktop-full.png", "mobile.png",
                 "hero-fallback.png", "hero-fallback.jpg"):
        add(name)
    return ordered


# --- prompt ----------------------------------------------------------------

def build_messages(ctx: dict) -> list[dict]:
    brief = ctx["brief"]
    shots = ctx["screenshots"]
    tier = ctx["tier"]
    page_excerpt = ctx["page_excerpt"]
    shot_hint = (
        "Available REAL screenshot files (reference these EXACT names in "
        "screenshotPaths, relative to the assets dir): "
        + (", ".join(shots) if shots else "(none captured — leave screenshotPaths empty; scenes degrade to clean brand-color fields)")
    )
    watermark_rule = (
        "watermark MUST be true (free teaser tier)." if tier == "teaser"
        else "watermark MUST be false (paid tier — no watermark)."
    )
    system = (
        "You are the LaunchReel Strategist. You write the CONTENT for a 30-second "
        "SaaS launch trailer as a single JSON object — never any render code. The "
        "renderer is deterministic Remotion; your JSON is its only input. Be "
        "punchy, concrete, and brand-accurate. No hype cliches, no lorem, no "
        "invented metrics — only use numbers/customers that appear in the brief. "
        "When the brief is thin, prefer honest minimalism over invented specifics: "
        "never fabricate metrics, customers, ratings, funding, or testimonials that "
        "are not in the brief — it is better to omit a metric or quote than to make "
        "one up. Lead with the real value proposition and concrete capability instead."
    )
    schema_rules = f"""Return ONE JSON object with EXACTLY these top-level keys:
{{
  "storyboard": {{ ...matches the LaunchReel storyboard schema below... }},
  "voiceover": "<a 60-80 word voiceover script, 6 short beats matching the 6 scenes: hook line, the problem, two product-tour beats, one proof line, a CTA line. Spoken, confident, no stage directions.>"
}}

storyboard object shape (all keys shown; omit truly-unknown OPTIONAL ones):
  brand: {{
    name: string (the product/wordmark),
    oneLiner: short positioning line,
    url: display URL for the browser frame + CTA pill (host only, e.g. "linear.app"),
    colors: {{ bg, accent, ink, paper?, accent2?, accent3?, accent4? }}  // hex like "#5E6AD2".
            bg is the LIGHT page background; ink is near-black for text/borders; accent is the brand's primary color.
            Infer the real brand palette from what you know of this product; if unsure, use a tasteful light scheme.
  }},
  watermark: boolean,
  scenes: [ exactly 6, in THIS order and type: hook, problem, tour_a, tour_b, social_proof, cta ]

Per-scene fields:
  - hook:         headline (3-7 words, the sharpest value line), sub (one supporting sentence).
  - problem:      headline (3-7 words, the pain), sub (one sentence sharpening it). screenshotPaths[0] optional (shown desaturated).
  - tour_a:       headline (3-7 words), sub (2-4 word callout), screenshotPaths:[<one real file>], metrics: up to 3 {{label,value}} drawn from keyFeatures/socialProof (value like "2x","50+","10,000+").
  - tour_b:       headline (3-7 words), sub (2-4 word callout), screenshotPaths:[<one real file, prefer a different one>], metrics: exactly 1 hero {{label,value}}.
  - social_proof: headline (3-7 words), metrics: up to 3 {{label,value}} (companies, rating, funding), quote: {{text, author}} from a real testimonial/customer in the brief (author may be "Used by <Customer>").
  - cta:          headline (3-7 words), sub (a button label ending with an arrow, e.g. "Start building →").

Rules:
  - {watermark_rule}
  - Headlines: 3-7 words. Subs: one short line. Never exceed the word budget.
  - {shot_hint}
  - Only reference screenshot files from the available list above; never invent filenames.
  - Metrics/quote MUST come from the brief's keyFeatures/socialProof — do not fabricate."""

    brief_block = json.dumps({
        "productName": ctx["product_name"],
        "oneLiner": ctx["one_liner"],
        "url": ctx["url"],
        "tier": tier,
        "brief": brief,
    }, ensure_ascii=False, indent=2)

    # Customer's own words carry the most weight: a resume answer (customerNotes) or
    # a pre-delivery tweak (feedbackNotes) folded in by the email loop. Honor these
    # above the scraped page copy — they are ground truth from the customer.
    notes_lines: list[str] = []
    cust = brief.get("customerNotes") if isinstance(brief, dict) else None
    if isinstance(cust, str) and cust.strip():
        notes_lines.append(
            "The customer told us this DIRECTLY — honor it above any scraped copy, and "
            "build the trailer's value proposition from it:\n" + cust.strip())
    fb = brief.get("feedbackNotes") if isinstance(brief, dict) else None
    if fb:
        fb_text = "; ".join(str(x).strip() for x in fb if str(x).strip()) if isinstance(fb, list) else str(fb).strip()
        if fb_text:
            notes_lines.append(
                "The customer reviewed a draft and asked for these changes — APPLY them "
                "faithfully in this cut:\n" + fb_text)
    notes_block = ("CUSTOMER NOTES (highest priority):\n" + "\n\n".join(notes_lines) + "\n\n") if notes_lines else ""

    user = (
        f"Product context:\n{brief_block}\n\n"
        + notes_block
        + (f"Source page copy (for tone/wording, excerpt):\n{page_excerpt}\n\n" if page_excerpt else "")
        + schema_rules
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# --- OpenAI ----------------------------------------------------------------

def is_reasoning(model: str) -> bool:
    return model.startswith(("gpt-5", "o1", "o3", "o4"))


def call_openai(model: str, key: str, messages: list[dict]) -> tuple[dict, dict]:
    body: dict = {
        "model": model,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    if is_reasoning(model):
        body["max_completion_tokens"] = 6000  # covers reasoning + JSON output
    else:
        body["temperature"] = 0.4
        body["max_tokens"] = 2000
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        payload = json.load(res)
    content = payload["choices"][0]["message"]["content"]
    usage = payload.get("usage", {})
    return json.loads(content), usage


# --- validation ------------------------------------------------------------

def load_schema(path: str) -> dict | None:
    return read_json(path)


def schema_errors(sb: dict, schema: dict | None) -> list[str]:
    """JSON Schema validation (if jsonschema is importable) — collected, not raised."""
    if not schema:
        return []
    try:
        import jsonschema
    except ImportError:
        return []
    validator = jsonschema.Draft7Validator(schema)
    errs = []
    for e in sorted(validator.iter_errors(sb), key=lambda x: list(x.path)):
        loc = "/".join(str(p) for p in e.path) or "(root)"
        errs.append(f"{loc}: {e.message}")
    return errs[:12]


def semantic_errors(sb: dict, screenshots: list[str], tier: str) -> list[str]:
    errs: list[str] = []
    scenes = sb.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != 6:
        errs.append(f"scenes must be exactly 6 (got {len(scenes) if isinstance(scenes, list) else 'none'})")
        return errs  # can't check further reliably
    for i, want in enumerate(SCENE_ORDER):
        got = scenes[i].get("type")
        if got != want:
            errs.append(f"scene[{i}].type must be '{want}' (got {got!r})")
    for i, sc in enumerate(scenes):
        hl = (sc.get("headline") or "").strip()
        if hl and not (2 <= len(hl.split()) <= 8):
            errs.append(f"scene[{i}] headline should be 3-7 words: {hl!r}")
        for p in sc.get("screenshotPaths", []) or []:
            if p not in screenshots:
                errs.append(f"scene[{i}] screenshotPath {p!r} is not an available file")
    if bool(sb.get("watermark")) != (tier == "teaser"):
        errs.append(f"watermark must be {tier == 'teaser'} for tier {tier!r}")
    colors = ((sb.get("brand") or {}).get("colors") or {})
    for k in ("bg", "accent", "ink"):
        if not HEX_RE.match(str(colors.get(k, ""))):
            errs.append(f"brand.colors.{k} must be a hex color (got {colors.get(k)!r})")
    return errs


# --- deterministic normalize + fallback ------------------------------------

def clamp_words(text: str, lo: int = 0, hi: int = 8) -> str:
    words = (text or "").split()
    if len(words) > hi:
        return " ".join(words[:hi])
    return " ".join(words)


def normalize(sb: dict, ctx: dict) -> dict:
    """Deterministically force schema-validity regardless of model drift:
    fixed 6-scene order+durations, valid palette, real screenshots only,
    correct watermark. Preserves the model's copy/metrics/quote where valid."""
    shots = ctx["screenshots"]
    tier = ctx["tier"]
    by_type = {}
    for sc in sb.get("scenes", []) or []:
        if isinstance(sc, dict) and sc.get("type") in SCENE_ORDER and sc["type"] not in by_type:
            by_type[sc["type"]] = sc
    # Deterministic copy to backfill any scene the model left empty — a scene is
    # never shipped without a headline (see the degenerate-response failure mode).
    fb = {s["type"]: s for s in deterministic_scenes(ctx)}

    scenes = []
    for idx, t in enumerate(SCENE_ORDER):
        src = by_type.get(t) or {}
        fbs = fb.get(t, {})
        sc: dict = {"type": t, "durationSec": CANON_DURATIONS[t]}
        headline = str(src.get("headline") or "").strip() or str(fbs.get("headline") or "").strip()
        if headline:
            sc["headline"] = clamp_words(headline)
        sub = str(src.get("sub") or "").strip() or str(fbs.get("sub") or "").strip()
        if sub:
            sc["sub"] = truncate_words(sub, 120)
        # screenshots: keep only real files; assign sensible defaults for tours.
        keep = [p for p in (src.get("screenshotPaths") or []) if p in shots]
        if t == "tour_a" and not keep and shots:
            keep = [shots[0]]
        if t == "tour_b" and not keep and shots:
            keep = [shots[1] if len(shots) > 1 else shots[0]]
        if t == "problem":
            keep = keep[:1]  # problem shows [0] desaturated at most
        if keep:
            sc["screenshotPaths"] = keep[:1] if t in ("tour_a", "tour_b", "problem") else keep
        # metrics — model's, else backfill (tours + social_proof carry metrics).
        def _clean_metrics(raw_list):
            out = []
            for m in raw_list or []:
                if isinstance(m, dict) and m.get("label") and m.get("value") is not None:
                    # Keep tiles legible: short labels, and never chop a value mid-word
                    # (the metric tile clips ~16 chars — "Startups & scaling" must not
                    # become "Startups & scali").
                    out.append({"label": truncate_words(str(m["label"]), 22),
                                "value": truncate_words(str(m["value"]), 16)})
            return out
        metrics = _clean_metrics(src.get("metrics")) or _clean_metrics(fbs.get("metrics"))
        if metrics and t in ("tour_a", "tour_b", "social_proof"):
            cap = 1 if t == "tour_b" else 3
            sc["metrics"] = metrics[:cap]
        # quote (social_proof only) — model's, else backfill.
        if t == "social_proof":
            q = src.get("quote") if isinstance(src.get("quote"), dict) else fbs.get("quote")
            if isinstance(q, dict) and q.get("text"):
                sc["quote"] = {"text": truncate_words(str(q["text"]), 158), "author": str(q.get("author", ""))[:60]}
        scenes.append(sc)

    brand_src = sb.get("brand") or {}
    colors_src = brand_src.get("colors") or {}
    colors: dict = {}
    for k in ("bg", "accent", "ink", "paper", "accent2", "accent3", "accent4"):
        v = colors_src.get(k)
        if isinstance(v, str) and HEX_RE.match(v):
            colors[k] = v
    for k in ("bg", "accent", "ink"):
        colors.setdefault(k, DEFAULT_PALETTE[k])

    brand = {
        "name": str(brand_src.get("name") or ctx["product_name"])[:60],
        "oneLiner": truncate_words(str(brand_src.get("oneLiner") or ctx["one_liner"] or ""), 120),
        "url": str(brand_src.get("url") or display_url(ctx["url"]))[:80],
        "colors": colors,
    }

    out = {"brand": brand, "watermark": tier == "teaser", "scenes": scenes}
    # audio block is attached later by voiceover.py; leave it off here.
    return out


def display_url(url: str) -> str:
    if not url:
        return ""
    host = re.sub(r"^[a-z]+://", "", url.strip(), flags=re.I).split("/")[0].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def truncate_words(text: str, max_chars: int) -> str:
    """Truncate to <= max_chars on a word boundary (never mid-word)."""
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0].rstrip(" ,;:-—")
    return cut or text[:max_chars]


def deterministic_scenes(ctx: dict) -> list[dict]:
    """The six raw scenes built straight from the brief + job fields. Always fully
    populated — used as the zero-LLM fallback AND to backfill a degenerate model
    response in normalize() so a scene is never shipped empty."""
    brief = ctx["brief"] or {}
    name = ctx["product_name"]
    one = ctx["one_liner"] or brief.get("oneLiner") or f"Meet {name}."
    feats = [f for f in (brief.get("keyFeatures") or []) if isinstance(f, str)]
    proof = [p for p in (brief.get("socialProof") or []) if isinstance(p, str)]
    shots = ctx["screenshots"]

    def metric_from(text: str) -> dict:
        m = re.search(r"([\$₹]?\d[\d,\.]*\s?[%x+MKmk]*)", text)
        return {"label": clamp_words(re.sub(r"[\$₹]?\d[\d,\.]*\s?[%x+MKmk]*", "", text).strip(" -—:"), hi=4) or "highlight",
                "value": (m.group(1).strip() if m else "New")}

    return [
        {"type": "hook", "durationSec": 5, "headline": clamp_words(one, hi=7) or name,
         "sub": truncate_words(one, 110)},
        {"type": "problem", "durationSec": 5, "headline": "The old way is slow.",
         "sub": (brief.get("category") and f"{brief['category']} shouldn't be this hard.") or "It shouldn't be this hard."},
        {"type": "tour_a", "durationSec": 6, "headline": clamp_words(feats[0], hi=6) if feats else "See it in action.",
         "sub": "Built for speed",
         **({"screenshotPaths": [shots[0]]} if shots else {}),
         # Metrics only when the brief actually gives us features to draw from — never
         # a fabricated stat when there's nothing real to show.
         "metrics": [metric_from(f) for f in feats[:3]]},
        {"type": "tour_b", "durationSec": 6, "headline": clamp_words(feats[1], hi=6) if len(feats) > 1 else "Everything connected.",
         "sub": "One workflow",
         **({"screenshotPaths": [shots[1] if len(shots) > 1 else shots[0]]} if shots else {}),
         "metrics": [metric_from(proof[0])] if proof else []},
        {"type": "social_proof", "durationSec": 5,
         "headline": "Loved by great teams." if proof else clamp_words(one, hi=6) or f"Meet {name}.",
         # No invented rating/traction: show real proof metrics or none at all.
         "metrics": [metric_from(p) for p in proof[:2]],
         "quote": {"text": truncate_words(proof[0] if proof else one, 150),
                   "author": "Trusted by teams" if proof else ""}},
        {"type": "cta", "durationSec": 3, "headline": clamp_words(one, hi=6) or f"Try {name}.",
         "sub": "Get started →"},
    ]


def deterministic_storyboard(ctx: dict) -> dict:
    """Zero-LLM fallback: brand + deterministic scenes, normalized. Always valid."""
    sb = {
        "brand": {"name": ctx["product_name"],
                  "oneLiner": ctx["one_liner"] or (ctx["brief"] or {}).get("oneLiner") or "",
                  "url": display_url(ctx["url"]), "colors": dict(DEFAULT_PALETTE)},
        "watermark": ctx["tier"] == "teaser",
        "scenes": deterministic_scenes(ctx),
    }
    return normalize(sb, ctx)


def missing_copy(sb_raw: dict) -> list[str]:
    """Copy-completeness check on the RAW model output (before normalize backfills),
    so a degenerate response — bare scene types with no headlines, a reasoning-model
    truncation — triggers the retry instead of silently shipping empty scenes."""
    scenes = sb_raw.get("scenes") if isinstance(sb_raw, dict) else None
    if not isinstance(scenes, list):
        return ["storyboard.scenes missing"]
    by_type = {s.get("type"): s for s in scenes if isinstance(s, dict)}
    errs = []
    for t in SCENE_ORDER:
        s = by_type.get(t) or {}
        if not str(s.get("headline") or "").strip():
            errs.append(f"scene '{t}' has no headline — write the on-screen copy")
    sp = by_type.get("social_proof") or {}
    if not (sp.get("quote") or sp.get("metrics")):
        errs.append("social_proof needs a quote or metrics from the brief")
    return errs


# --- orchestration ---------------------------------------------------------

def generate(ctx: dict, schema: dict | None, key: str, model: str) -> tuple[dict, str, dict]:
    """Try model (+ one retry with errors), then gpt-4o-mini, then deterministic.
    Returns (normalized_storyboard, voiceover_text, meta)."""
    meta = {"model": None, "usage": {}, "attempts": [], "voiceover_from": "model"}
    if not key:
        log("no OPENAI_API_KEY — using deterministic storyboard")
        sb = deterministic_storyboard(ctx)
        return sb, deterministic_vo(ctx), {**meta, "model": "deterministic"}

    messages = build_messages(ctx)
    for m in [model, "gpt-4o-mini"] if model != "gpt-4o-mini" else [model]:
        errors_feedback = None
        for attempt in (1, 2):
            msgs = list(messages)
            if errors_feedback:
                msgs.append({"role": "user", "content":
                             "Your previous JSON had these problems — fix them and return the full corrected object:\n- "
                             + "\n- ".join(errors_feedback)})
            try:
                raw, usage = call_openai(m, key, msgs)
            except (urllib.error.HTTPError, urllib.error.URLError, ValueError, KeyError) as e:
                detail = e.read().decode()[:200] if hasattr(e, "read") else str(e)
                log(f"{m} attempt {attempt} call failed: {detail}")
                meta["attempts"].append({"model": m, "attempt": attempt, "error": detail[:120]})
                break  # try next model
            sb_raw = raw.get("storyboard", raw)
            vo = str(raw.get("voiceover", "")).strip()
            # Copy-completeness is checked on the RAW output (normalize backfills it,
            # which would otherwise mask a degenerate response and skip the retry).
            copy_errs = missing_copy(sb_raw)
            sb = normalize(sb_raw, ctx)  # then validate the real artifact for schema/semantics
            errs = copy_errs + schema_errors(sb, schema) + semantic_errors(sb, ctx["screenshots"], ctx["tier"])
            meta["attempts"].append({"model": m, "attempt": attempt, "errors": errs, "usage": usage})
            if not errs:
                log(f"{m} produced a valid storyboard (attempt {attempt})")
                if not vo:
                    vo = deterministic_vo(ctx)
                    meta["voiceover_from"] = "deterministic"
                return sb, vo, {**meta, "model": m, "usage": usage}
            log(f"{m} attempt {attempt}: {len(errs)} issue(s) after normalize: {errs[:3]}")
            errors_feedback = errs
        # model exhausted its retry — fall to next model
    log("all model attempts failed validation — using deterministic storyboard")
    sb = deterministic_storyboard(ctx)
    return sb, deterministic_vo(ctx), {**meta, "model": "deterministic", "voiceover_from": "deterministic"}


def deterministic_vo(ctx: dict) -> str:
    brief = ctx["brief"] or {}
    name = ctx["product_name"]
    one = ctx["one_liner"] or brief.get("oneLiner") or f"the new way to work"
    feats = [f for f in (brief.get("keyFeatures") or []) if isinstance(f, str)]
    f1 = feats[0] if feats else "everything in one place"
    f2 = feats[1] if len(feats) > 1 else "built for speed"
    return (
        f"Meet {name}. {one} "
        f"Today, the work is scattered across a dozen tools and it slows everyone down. "
        f"{name} brings it together: {f1}. "
        f"And it keeps you moving — {f2}. "
        f"Teams that switched ship faster and never look back. "
        f"{name}. Try it today."
    )


def estimate_cost(model: str, usage: dict) -> float:
    p = PRICING.get(model)
    if not p or not usage:
        return 0.0
    pin, pout = p
    return round(usage.get("prompt_tokens", 0) / 1e6 * pin + usage.get("completion_tokens", 0) / 1e6 * pout, 5)


def main() -> int:
    ap = argparse.ArgumentParser(description="LaunchReel storyboard writer")
    ap.add_argument("--bundle-dir", required=True, help="Scout output dir (brief.json, manifest.json, screenshots)")
    ap.add_argument("--product-name", default="")
    ap.add_argument("--one-liner", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--tier", default="teaser", choices=["teaser", "trailer", "pack"])
    ap.add_argument("--out", default=None, help="storyboard.json path (default <bundle-dir>/storyboard.json)")
    ap.add_argument("--vo-out", default=None, help="vo.txt path (default <bundle-dir>/vo.txt)")
    ap.add_argument("--model", default="gpt-5-mini")
    ap.add_argument("--schema", default=os.path.join(REPO, "render", "storyboard.schema.json"))
    ap.add_argument("--meta-out", default=None, help="optional path to write generation meta JSON")
    args = ap.parse_args()

    bundle = os.path.abspath(args.bundle_dir)
    if not os.path.isdir(bundle):
        log(f"ERROR: bundle-dir not found: {bundle}")
        return 1
    out_path = args.out or os.path.join(bundle, "storyboard.json")
    vo_path = args.vo_out or os.path.join(bundle, "vo.txt")

    brief = read_json(os.path.join(bundle, "brief.json")) or {}
    manifest = read_json(os.path.join(bundle, "manifest.json"))
    screenshots = available_screenshots(bundle, manifest)
    page_md_path = os.path.join(bundle, "page.md")
    page_excerpt = ""
    if os.path.exists(page_md_path):
        try:
            with open(page_md_path, encoding="utf-8") as fh:
                page_excerpt = fh.read(2000)
        except OSError:
            page_excerpt = ""

    product_name = args.product_name or brief.get("productName") or display_url(args.url).title() or "Untitled"
    one_liner = args.one_liner or brief.get("oneLiner") or ""

    ctx = {
        "brief": brief,
        "screenshots": screenshots,
        "tier": args.tier,
        "product_name": product_name,
        "one_liner": one_liner,
        "url": args.url,
        "page_excerpt": page_excerpt,
    }
    log(f"product={product_name!r} tier={args.tier} screenshots={screenshots or '(none)'}")

    key = load_env_key("OPENAI_API_KEY")
    schema = load_schema(args.schema)
    sb, vo, meta = generate(ctx, schema, key, args.model)

    # Final safety: re-validate the artifact we're about to write.
    errs = schema_errors(sb, schema) + semantic_errors(sb, screenshots, args.tier)
    if errs:
        log(f"WARNING: post-normalize validation still flags {len(errs)} issue(s); using deterministic fallback")
        sb = deterministic_storyboard(ctx)
        meta["model"] = "deterministic"
        errs = schema_errors(sb, schema) + semantic_errors(sb, screenshots, args.tier)
        if errs:
            log(f"ERROR: deterministic storyboard invalid?! {errs}")
            return 1

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(sb, fh, indent=2)
    with open(vo_path, "w", encoding="utf-8") as fh:
        fh.write(vo.strip() + "\n")

    cost = estimate_cost(meta.get("model", ""), meta.get("usage", {}))
    meta_out = {
        "model": meta.get("model"),
        "voiceover_from": meta.get("voiceover_from"),
        "usage": meta.get("usage", {}),
        "est_cost_usd": cost,
        "vo_words": len(vo.split()),
        "screenshots": screenshots,
        "storyboard": os.path.abspath(out_path),
        "vo": os.path.abspath(vo_path),
    }
    if args.meta_out:
        with open(args.meta_out, "w", encoding="utf-8") as fh:
            json.dump(meta_out, fh, indent=2)
    log(f"wrote {out_path} (model={meta.get('model')}, ~${cost}) + {vo_path} ({len(vo.split())} words)")
    print(json.dumps(meta_out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
