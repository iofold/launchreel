# LaunchReel trailer-quality rubric

The goal-post a delivered trailer is scored against. Seven dimensions, each 1-5 with
concrete anchors at 1 / 3 / 5. Anchors are written to be **verifiable from the artifact**
(the video file, its scorecard, the storyboard JSON) — not vibes. Two dimensions carry
**auto-fail** rules because a low score there means shipping a visibly broken video.

Scope note: the automated vision rig (`eval/scripts/frame-qa.py`) judges four of these
seven dimensions from stills. The other three (scene contract, motion quality, VO/audio
sync) need the storyboard JSON, the full video timeline, or human review — see the
readiness checklist at the bottom for exactly what the rig can and cannot replace today.

---

## Dimensions

### 1. Brand fidelity  *(rig-scored)*
Palette, logo/wordmark, and tone match the source site.
- **1** — Wrong or absent palette; no logo/wordmark; looks like a generic AI template with none of the brand's identity.
- **3** — Right general vibe but the accent color is off, or the logo is inconsistent / low-res / appears in only some scenes.
- **5** — Palette (background + accent), logo, and typographic tone are unmistakably this brand, consistent across all six scenes. Matches the brand-json ground truth when supplied.

### 2. Text legibility  *(rig-scored · AUTO-FAIL)*
Every on-screen word is crisp and correctly spelled.
- **1** — Headline or UI text is smeared, warped, or gibberish (classic gen-video artifact, e.g. "Daa Conboudest"). **Auto-fail.**
- **3** — Mostly readable; one soft or slightly warped word, or a single low-contrast caption.
- **5** — Every on-screen word — headlines, UI labels, metrics, CTA URL — is razor-crisp with correct spelling.
- **Auto-fail:** score ≤ 2 → re-render. Text is the one thing gen-video reliably breaks, and a smeared trailer is unshippable no matter how good the rest is.

### 3. Scene contract  *(NOT rig-scored — checked against storyboard JSON + timeline)*
All six scenes present, correct order, correct durations (±20%).
Contract: **Hook · Problem · Product Tour A · Product Tour B · Social Proof · CTA**, target ~30s
at the per-scene budget (Hook ~5s / Problem ~5s / Tour A ~6s / Tour B ~6s / Social Proof ~5s / CTA ~3s).
- **1** — A required scene is missing or out of order, or total runtime is off by >40% from ~30s.
- **3** — All six present and ordered, but one scene's duration is outside the ±20% band, or pacing is lumpy.
- **5** — All six scenes present, in order, every duration within ±20% of its budget, total 27-33s.

### 4. Real-UI truthfulness  *(rig-scored · AUTO-FAIL)*
Product Tour scenes show the **real** product (captured screenshots / deterministic Remotion), never a hallucinated interface. Where no real UI exists, honest abstract b-roll that does not pretend to be UI is also correct.
- **1** — Shows an obviously fake dashboard: invented widgets, nonsense labels, warped charts, gen-video UI. **Auto-fail.**
- **3** — Plausible interface but you cannot confirm it is the real product; generic stock-looking UI.
- **5** — Frames clearly show the real, coherent product interface from the source site — OR, for a site with no product UI (e.g. a stealth splash page), honest abstract/brand b-roll that makes no false UI claim.
- **Auto-fail:** score ≤ 2 → re-render. Per the motion skill's one rule, real UI never goes through a gen-video model; a hallucinated dashboard is a truthfulness failure, not a style choice.

### 5. Motion quality  *(NOT rig-scored — needs the video timeline)*
Eases read as intentional; no jank; keyframe interpolation is smooth.
- **1** — Linear or stuttering motion, popping cuts, visible jank, or dreamlike gen-video drift where a locked composition was intended.
- **3** — Motion works but is mechanical: default linear eases, an abrupt transition, or one shot that drifts.
- **5** — Deliberate eases (spring / cubic-bezier), staggered reveals, count-up metrics, and clean keyframe interpolation; every move reads as designed.

### 6. VO / audio sync  *(NOT rig-scored — needs audio + timeline)*
Script matches the scene on screen; music bed sits under the VO.
- **1** — VO describes something not on screen, VO clipped/overruns scene boundaries, or music drowns the VO / no audio.
- **3** — Script broadly tracks the scenes but one line lands on the wrong scene, or music level fights the VO in places.
- **5** — Each VO line lands on its scene; music bed is present and ducked under the VO; ends cleanly on the CTA.

### 7. CTA correctness  *(rig-scored — partial; watermark + URL visible in stills)*
CTA end-card shows the right URL; free tier carries the watermark, paid tier does not.
- **1** — No CTA end-card and no URL anywhere; or (free tier) no watermark; or (paid tier) a leftover watermark.
- **3** — CTA/wordmark exists but the URL is unclear/wrong, or the watermark rule is only partially satisfied.
- **5** — Clean CTA end-card, correct and legible product URL, watermark rule satisfied for the tier (free: LaunchReel watermark present; paid: absent).

---

## Overall pass threshold

A trailer is **shippable** when **all** of:
1. **No auto-fail** — text legibility ≥ 3 **and** real-UI truthfulness ≥ 3.
2. **No dimension < 3** across all seven.
3. **Mean of the seven ≥ 4.0.**

Outcomes:
- **Ship** — all three conditions met.
- **Re-render** — any auto-fail dimension ≤ 2. Do not send to human; it will fail review. (One revision per customer, then human escalation per AGENTS.md.)
- **Needs human** — no auto-fail, but a dimension sits at 3 or the mean is < 4.0. Borderline; a human makes the ship/re-render call at the approval gate.

The `frame-qa.py` rig applies conditions 1-3 **restricted to its four still-dimensions** and emits
`pass | fail | needs_human`. A rig `fail` is authoritative (re-render immediately). A rig `pass`
clears the stills but is **necessary-not-sufficient** — scene contract, motion, and VO/audio still
gate the full ship (see below).

---

## Vision-rig readiness checklist — when auto-scoring may replace the human at the approval gate

The rig judges **brand fidelity, text legibility, real-UI truthfulness, and CTA/watermark** from
N evenly-spaced stills via a Gemini flash model. Observed judge quality from the 2026-07-12 smoke
test (two raw sample clips) is documented honestly below; the rig graduates from advisory to
gating **only** when every box is checked.

**Calibration gates (must all pass before auto-approve is enabled):**
- [ ] **Auto-fail recall = 100%.** On a labeled set of ≥ 20 trailers (mix of clean + deliberately smeared/hallucinated), the rig flags **every** human-labeled auto-fail (smeared text, hallucinated UI). Zero false-passes on an auto-fail dimension is the hard bar — a false pass ships a broken video.
- [ ] **Verdict agreement on ≥ 15 consecutive real trailers.** The rig's `verdict` matches the human's ship/re-render/needs-human call 15 times in a row. A single disagreement that would have shipped a bad trailer resets the counter.
- [ ] **No false-fail storm.** False-fail rate < 15% on clean trailers (a rig that cries wolf gets ignored and defeats the point). Track false-fails per run.
- [ ] **CTA/watermark frame coverage.** Frame count is high enough that a short (~1-2s) CTA end-card is reliably sampled. Verified by confirming the last sampled frame lands inside the CTA scene on ≥ 10 trailers; otherwise raise `--frames` or add an explicit last-frame grab.
- [ ] **Brand-json supplied.** Brand fidelity is only gate-grade when the rig is given ground-truth palette/logo; without it the score reflects internal consistency, not brand match (see below). Auto-approve requires brand-json in the call.

**Observed judge quality (smoke test, gemini-2.5-flash, 8 frames/video, ~$0.0025/video):**
- **Text legibility — reliable.** On the pure-Veo clip it scored **1** and quoted the actual gibberish ("Daa Conboudest"); on the keyframe-interpolation clip it scored **2**, correctly catching that frame 0 was blurry while frame 7 was crisp (the Veo mid-motion smear). High confidence to gate on.
- **Real-UI truthfulness — reliable.** Scored the hallucinated Veo UI **1** ("invented widgets... nonsensical labels") and the coherent dashboard **4**. Distinguishes real-looking from fake well. High confidence.
- **CTA/watermark — reliable-but-coverage-dependent.** Correctly scored both raw clips **1** (no CTA, no watermark). Caveat: it can only judge what was sampled — a brief end-card can be missed by too-few frames. Gate only after the frame-coverage box above is checked.
- **Brand fidelity — advisory only without ground truth.** Scored **3-4** on internal consistency ("consistent orange accent") but had no brand to match against, so it cannot yet catch a *wrong-but-consistent* palette. Do not gate on brand fidelity until brand-json is wired in.

**Until all boxes are checked:** the rig runs as an **advisory pre-filter** — an auto-`fail` short-circuits
to re-render (safe: high auto-fail recall observed), but every `pass`/`needs_human` still goes to a human
at the approval gate.
