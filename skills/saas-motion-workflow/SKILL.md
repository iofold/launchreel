---
name: saas-motion-workflow
description: Produce branded 30-second SaaS launch-trailer motion — Remotion as the deterministic renderer plus Veo 3.1 first+last keyframe-pair b-roll — with verified request shapes, a per-scene recipe for the 6 LaunchReel scenes, prompt templates, and a cost budget.
---

# saas-motion-workflow — LaunchReel production recipe

How to turn a SaaS brand's assets into a 30-second, six-scene launch trailer
(**Hook · Problem · Product Tour A · Product Tour B · Social Proof · CTA**).

Two rendering layers, and the whole skill is about **which scene gets which layer**:

1. **Deterministic Remotion (primary).** React/Remotion compositions render pixel-exact,
   legible, brand-locked frames for free (local render). This is the default for every
   scene, and the **only** acceptable renderer for real product UI, metrics, and any
   on-screen text.
2. **Veo 3.1 keyframe-pair b-roll (premium layer).** For abstract/atmospheric shots
   (Hook flourish, CTA background) you generate a **first** and a **last** still, then let
   Veo 3.1 interpolate the motion between them. Verified working (see below). Use it where
   motion sells and text does not need to survive.

> **The one rule that decides the whole trailer:** never send real product UI or critical
> text through a generative video model. It smears. Bake UI and text in Remotion; use
> gen-video only for brand-locked abstract motion, with any text overlaid in Remotion on top.
> (Grounded in the toolkit's own hard-won finding — see Attribution.)

---

## 1. The keyframe-pair → video recipe (verified)

**Idea:** compose the *start* and *end* of a shot as two still images, then interpolate.
This gives frame-accurate control of composition — the shot begins and ends exactly where
you drew it — which is what makes AI video usable for branded motion graphics instead of
random dreamlike drift.

### Step 1 — generate the two keyframes

| Frame kind | Model | Why | Cost (observed) |
| --- | --- | --- | --- |
| **Text-bearing** (wordmark, metric, CTA end-card, labeled UI) | **`gpt-image-2`** via `openai-genai-assets/scripts/image-gen.ts` | renders legible text; strongest instruction-following | ~$0.005 (low, 1536×1024) |
| **Texture / abstract** (gradient fields, particle beds, bokeh, brand-color washes) | **FLUX** via `cf-genai-assets/scripts/cf-image.sh` (`flux-1-schnell` / `flux-2-klein-4b`) | cheap + fast; text garbles (irrelevant here) | ~$0.002 |

### Step 2 — brand-lock the pair (composition-preserving edit)

Generate the **first** frame, then derive the **last** frame from it with an
**instruction-edit** so the two share layout, palette, and framing (clean interpolation):

```bash
S=<manifold>/skills/openai-genai-assets/scripts
bun run $S/image-gen.ts  --prompt "<first-frame>" --out first.png --size 1536x1024 --quality low
bun run $S/image-edit.ts --image first.png \
  --prompt "Keep the exact same layout, camera framing, background and colors. <what changes>. Do not move or rescale anything." \
  --out last.png --size 1536x1024 --quality low
```

`image-edit.ts` (gpt-image-2) re-renders the source at high fidelity and follows the edit,
so the last frame is the first frame *plus a delta* — the recipe for "dashboard populates",
"metric counts up", "wordmark resolves". A recolor-only edit is also how you brand-lock a
generic still to the client palette. This mirrors the toolkit's `image_edit.py` variant step.

Match the **keyframe aspect to the video aspect**. Veo pads a mismatched pair with black
bars — my 3:2 (1536×1024) keyframes letterboxed inside a 16:9 request. For 16:9 use
`--size 1536x1024` and accept a slight pad, or crop to 16:9 before submitting; for 9:16 use
`1024x1536`.

### Step 3 — interpolate with Veo 3.1

```bash
python3 scripts/keyframe-video.py \
  --first-image first.png --last-image last.png \
  --prompt "<what animates between the frames; camera behavior>" \
  --duration 6 --aspect 16:9 --resolution 720p \
  --backend vertex --project iofold-gcp --out shot.mp4
```

**VERIFIED request shape (Vertex, 2026-07-12, project `iofold-gcp`/`us-central1`, model
`veo-3.1-fast-generate-001`, `:predictLongRunning`).** First try, 4s clip, 53s wall, 583 KB,
1280×720 H.264+AAC. The clip opened on the empty-skeleton keyframe and closed on the
populated-dashboard keyframe — interpolation confirmed.

```jsonc
{
  "instances": [{
    "prompt": "Locked-off camera... cards populate with data...",
    "image":     { "bytesBase64Encoded": "<FIRST frame b64>", "mimeType": "image/png" },
    "lastFrame": { "bytesBase64Encoded": "<LAST  frame b64>", "mimeType": "image/png" }
  }],
  "parameters": { "aspectRatio": "16:9", "resolution": "720p", "durationSeconds": 4, "sampleCount": 1 }
}
```

- **First frame → `instances[].image`. Last frame → `instances[].lastFrame`.** Both are
  `{ bytesBase64Encoded, mimeType }`. This is the raw-REST equivalent of the SDK's
  `generate_videos(image=<first>, config=GenerateVideosConfig(last_frame=<last>))`.
- **`lastFrame` lives in `instances[]`, NOT in `parameters`.** (Published guides disagree;
  the in-`instances` form is what actually worked.)
- **Backends** (`--backend vertex|gemini|auto`, same resolution logic as `gcp-genmedia`):
  - **Vertex (preferred, draws GCP credits):** model `veo-3.1-fast-generate-001`; poll
    `:fetchPredictOperation`; result in `response.videos[0].bytesBase64Encoded`.
  - **Gemini API (fallback, billed to key):** model `veo-3.1-fast-generate-preview`; poll
    `GET /v1beta/{op}`; result in `response.generateVideoResponse.generatedSamples[0].video`.
    Duration is fixed at 8s on the Gemini API (`durationSeconds` ignored).
- **Model tier matters for keyframe pairs:** last-frame interpolation is a Veo 3.1
  **Standard / Fast** capability. **Do not use a `-lite-` model** for a first+last pair —
  Lite is text/first-frame only (the script warns if you pass one). Lite is still fine for
  *single-image* animation.
- **Knobs:** `--duration` 4–8 (Vertex), `--aspect` 16:9 | 9:16, `--resolution` 720p | 1080p,
  `--poll` (default 10s), `--timeout` (default 600s). Audio is emitted by default; for a
  trailer you normally mute the Veo track and lay your own music/VO.

### Step 4 — the text caveat (why UI stays in Remotion)

Veo anchors the first and last frames crisply but **softens fine text and numbers in the
in-between frames** — in the smoke test the metric digits and table labels warped mid-motion
even though both keyframes were clean. So:

- Put **legible text, exact metrics, real UI, and the CTA URL in Remotion**, composited over
  the (muted) Veo clip via `<OffthreadVideo>`.
- Reserve gen-video for **motion under the text**, not the text itself.

---

## 2. Per-scene recipe — the 6 LaunchReel scenes

Target 30s at 30fps (Remotion) / 24fps (Veo clips). Durations follow the toolkit's
product-demo pacing (`title 9s / problem 14s / solution 13s / stats 12s / cta 10s`,
compressed to a 30s total).

| # | Scene | Duration | Renderer | Technique | Gen-video? |
| --- | --- | --- | --- | --- | --- |
| 1 | **Hook** | ~5s | Veo keyframe-pair **under** Remotion type | Brand-locked abstract → wordmark-adjacent motion; kinetic headline typed in Remotion on top | **Yes** (premium) |
| 2 | **Problem** | ~5s | Remotion + static still | "Chaos" mood board (cluttered tabs/inbox/spreadsheet), desaturated/red tint; Remotion pans/masks it | Optional |
| 3 | **Product Tour A** | ~6s | **Remotion (deterministic)** or real screen-capture hybrid | Dashboard **assembles** — cards slide/fade in, chart draws, numbers count up | **No** |
| 4 | **Product Tour B** | ~6s | **Remotion (deterministic)** | Feature callouts + metric counters; zoom-to-payoff on one hero number | **No** |
| 5 | **Social Proof** | ~5s | Remotion | Logo wall, testimonial card, big outcome metric counter; static avatars/logos as stills | **No** |
| 6 | **CTA** | ~3s | Remotion end-card, optional Veo **background** | Legible wordmark + URL + button; optional brand-locked atmospheric Veo bed behind the text | Optional (bg only) |

**Default build = 1 Veo clip (Hook).** **Premium build = 2 (Hook + CTA background).** The two
Product Tour scenes are **always deterministic** (real UI + text → Remotion or x11grab capture).

### Per-scene prompt templates (SaaS motion graphics)

Placeholders: `{{BG}}`, `{{ACCENT}}` = brand palette (e.g. Hypermodel `#FAFAF8` / `#E85D3A`);
`{{PRODUCT}}`, `{{METRIC}}`, `{{URL}}`.

**Scene 1 — Hook (Veo keyframe-pair; text goes in Remotion):**
- *first-frame (gpt-image-2):* `Minimal abstract brand field, {{BG}} background, soft {{ACCENT}} gradient orb off-center, faint geometric grid, lots of negative space, flat vector, 16:9, no text`
- *last-frame (image-edit of first):* `Keep the same framing and colors. The {{ACCENT}} orb has bloomed into a tight cluster of clean UI cards converging toward center, subtle depth. Do not move the background.`
- *motion prompt:* `Slow push-in. Abstract {{ACCENT}} shapes coalesce into crisp product-UI cards. Confident, premium, smooth ease. No camera shake, no text.`

**Scene 2 — Problem (Remotion over a static still):**
- *still (gpt-image-2 or FLUX):* `Overwhelmed workflow: many overlapping browser tabs, a cluttered spreadsheet, sticky notes, muted desaturated palette with a {{ACCENT}} warning tint, top-down, flat illustration, 16:9`
- *Remotion:* slow drift + progressive blur/mask reveals of the clutter; one-line problem caption, {{ACCENT}} highlight on the key term.

**Scene 3 — Product Tour A / dashboard assembles (Remotion, deterministic — this is the verified visual):**
- Build the real dashboard in Remotion; animate with `interpolate()` / `spring()`:
  cards `translateY(16→0)` + `opacity(0→1)` staggered, chart path `strokeDashoffset` draw-on,
  metrics count up. If you must fake a UI you don't have, generate the **keyframe pair**
  (empty skeleton → populated) as a *reference/storyboard*, but render the final in Remotion
  so text stays sharp. (Skeleton→populated pair is exactly the smoke-test artifact.)

**Scene 4 — Product Tour B / feature callouts (Remotion, deterministic):**
- Callout chips animate in next to UI regions; one **metric counter** (`{{METRIC}}`) counts up;
  camera CSS-zoom to 1.3–1.5× on the payoff number, then reset (toolkit "zoom on payoff only").

**Scene 5 — Social Proof (Remotion):**
- Logo wall fades/staggers in; a testimonial card slides up; a large outcome counter.
  Avatars/logos as static `gpt-image-2` stills. No gen-video.

**Scene 6 — CTA (Remotion end-card; optional Veo background):**
- *Remotion:* `{{PRODUCT}}` wordmark, `{{URL}}`, button; end near a resting state, loop-friendly.
- *optional Veo bg keyframe-pair:* first `soft {{BG}} field, faint {{ACCENT}} gradient, empty` →
  last `same field, gentle {{ACCENT}} light-bloom center`; motion `slow ambient light drift,
  no text` — muted, behind the Remotion text.

---

## 3. Pacing & cost budget (30s trailer)

Veo list price (Vertex, credit-eligible): **fast $0.10/s**, **lite $0.05/s** (single-image only),
**standard $0.40/s audio / $0.20/s silent**. Keyframe stills: gpt-image-2 low ~$0.005 (gen) /
~$0.017 (edit); FLUX ~$0.002. Music (Lyria) ~$0.04 / 30s; VO (`gpt-4o-mini-tts`) ~$0.015/min.

| Build | Gen-video scenes | Veo cost (fast) | Stills + music + VO | **Per-trailer total** |
| --- | --- | --- | --- | --- |
| **All-Remotion** | none | $0 | ~$0.12 | **~$0.12** |
| **Default (recommended)** | Hook (5s) | ~$0.50 + 2 keyframes ~$0.02 | ~$0.12 | **~$0.65** |
| **Premium** | Hook + CTA-bg (5s each) | ~$1.00 + 4 keyframes ~$0.04 | ~$0.12 | **~$1.15** |
| **Max (every scene Veo, not advised)** | 6 × 5s | ~$3.00 | ~$0.15 | **~$3.15** |

- **Smoke test actually spent ≈ $0.42** (keyframes $0.022 + one 4s Veo-fast clip $0.40).
- Keep Veo clips **4–6s**; a 30s trailer needs at most 1–2 of them. Product Tour scenes render
  free in Remotion — spending Veo budget there is both costlier and lower quality (text smear).
- Draft keyframes at `--quality low`; only go `medium/high` for a final Hook where the abstract
  frame is the hero. Re-use one brand-locked base still across scenes via `image-edit` recolors.

---

## 4. Attribution — what came from the toolkit

Source: `/home/ubuntu/workspace/claude-code-video-toolkit`.

- **Keyframe/continuity pattern** — `tools/chain_video.py` + `skills/openclaw-video-toolkit/SKILL.md`
  (§4d-chain). The toolkit chains **single-image** LTX-2 clips: extract the *last frame* of clip N
  (`ffmpeg -sseof -0.1 … -frames:v 1`) and feed it as the *first frame* (`--input`) of clip N+1.
  It has **no first+last-frame *pair* conditioning** — LTX-2 takes one input image. This skill's
  Veo keyframe-*pair* recipe is the missing capability; the toolkit's last-frame-extract trick is
  reused for chaining multiple keyframe-pair shots.
- **Never interpolate synthetic UI** — `docs/browser-demo-recording.md` ("`minterpolate` on UI
  smears text/edges — Never"; the whole headed-Chrome-on-Xvfb + `x11grab` real-frame capture
  pipeline, `director.js` cursor/ripple/caption/zoom overlay). Basis for keeping Product Tour
  scenes in Remotion / real capture, and for the "audit frames with a vision model" QA loop.
- **Style-drift control** — `chain_video.py` §"Style drift": always per-scene prompts, always a
  `--negative-prompt` to exclude off-brand styles, strong per-scene style anchors → adapted here
  as brand-locking keyframe pairs and overlaying text in Remotion.
- **Brand system** — `brands/*/brand.json` (colors/fonts/motion; e.g. `brands/hypermodel/brand.json`
  → `{{BG}} #FAFAF8`, `{{ACCENT}} #E85D3A`, easing `cubic-bezier(0.16,1,0.3,1)`), `lib/brand.ts`
  loader, `flux2.py --brand` (inject palette into image prompts), `image_edit.py` (recolor variants).
- **Pacing / Remotion conventions** — `templates/product-demo` (`src/config/types.ts` scene types;
  `title 9 / problem 14 / solution 13 / stats 12 / cta 10`s; duration `ceil(words/2.5)+2`; per-scene
  audio `from={30}` = 1s delay; `interpolate()`/`spring()`, always `<OffthreadVideo>` for clips).
- **LTX-2 / cost reference** — `docs/ltx2.md` (image-to-video, ~$0.23/5s clip, `(n-1)%8==0` frame
  counts, ~30% training-data logo/text artifacts → another reason not to gen real UI).

Provider scripts extended: `manifold/skills/gcp-genmedia` (Veo LRO + auth/backend — `_genmedia_common.py`
is copied into this skill's `scripts/`), `openai-genai-assets` (gpt-image-2 gen/edit keyframes),
`cf-genai-assets` (FLUX texture keyframes).

## Files

- `scripts/keyframe-video.py` — first+last keyframe → Veo 3.1 MP4 (stdlib only; `--backend vertex|gemini|auto`).
- `scripts/_genmedia_common.py` — copied auth/HTTP/backend helpers from `gcp-genmedia` (self-contained).
- Sample smoke-test output: `manifold/.tmp/genai-samples/keyframe/` (`first.png`, `last.png`,
  `dashboard-assemble.mp4`, extracted `clip-first.png` / `clip-last.png`).
