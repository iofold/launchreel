# Direction 03 — THE CREW · "Five specialists. One job: your launch."

**Comp:** `TheCrew` · slug `the-crew` · out `out/03-the-crew.mp4`
**Vibe:** heist-movie title sequence meets Wes Anderson symmetry. The five agents are a
crew being assembled for a job — your launch. Deadpan-charming, jazzy, precise.

## Hook (0.0–2.0s)
A manila dossier folder SLAMS onto a cream table (top-down), rubber-stamp hits:
**"JOB #0147 — THE LEDGERLY LAUNCH"**, then a second stamp, red-ish pink, slightly
rotated: **"DEADLINE: TONIGHT"**. Paper-slam SFX beat.

## Beats
1. **0–3s** — dossier slam + stamps. A polaroid of a product screenshot paper-clipped on.
2. **3–15s — MEET THE CREW** (~2.3s each, identical layout = comic rhythm): freeze-frame
   title-card per agent — centered avatar chip, name in huge type, specialty, and one
   deadpan credential line:
   - **SCOUT** · Brand research · "cases your website in 90 seconds"
   - **STRATEGIST** · Creative brief · "found your value prop. it was in the footer"
   - **DIRECTOR** · Storyboard · "six scenes. no notes."
   - **RENDERER** · Motion + VO · "does the work of 47 After Effects layers"
   - **PUBLISHER** · Premiere · "invites everyone. even your investors"
   Each card: color block of that agent's brand color, whip-pan transition between cards.
3. **15–22s — THE JOB (montage):** quick symmetric cuts of the pipeline UI doing its
   thing — status chips flipping (research→storyboard→voiceover→rendering), storyboard
   thumbnails appearing in a row, waveform pulsing — over a split-flap "T-MINUS" counter.
4. **22–26s — THE DELIVERY:** "Your reel is ready 🎉" delivery screen recreation; trailer
   thumbnail; stamp: "DELIVERED — 4 MIN 47 SEC".
5. **26–30s — end-card:** the five avatar chips lined up symmetrically under the
   wordmark. "Five specialists. One job: your launch." + `launchreel.xyz` + free teaser.

## VO (dry, cool narrator, gpt-4o-mini-tts `echo`, instructions: "deadpan heist-film narrator, unhurried, wry")
"Every launch needs a crew. The scout. The strategist. The director. The renderer. The
publisher. They've done this before. Yours is next. LaunchReel — the crew works in minutes."

## Music
Lyria: "cool jazzy heist groove, upright bass walking line, brushed drums, vibraphone
accents, 105bpm, playful and confident" (abstract terms only — no artist names).

## Technique notes
- Avatars: rebuild the mock's bot avatars as clean SVG/CSS (rounded-square heads with
  simple faces, each in its crew color — reference `public/assets/mock-2-jobboard.png`).
  Optionally gpt-image-2 ONE sticker-sheet still of 5 mascot bots, brand palette, and
  crop — but CSS rebuild keeps them crisp and consistent.
- Title cards: obsessive centering, generous whitespace, tiny index numbers ("2 of 5") —
  symmetry IS the joke.
- Split-flap counter: per-character flip animation (rotateX 90° swap) — sells the vibe.
- Whip-pans: 3–4 frame translateX blur transitions (@remotion/motion-blur helps).
- Paper texture: FLUX still (≤$0.01) or subtle CSS noise. Everything else pure Remotion.
