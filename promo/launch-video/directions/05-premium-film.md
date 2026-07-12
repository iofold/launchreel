# Direction 05 — OPENING NIGHT · cinematic Veo (the premium flex)

**Comp:** `OpeningNight` · slug `premium-film` · out `out/05-premium-film.mp4`
**Vibe:** the tasteful counterpoint — a slow, cinematic "your launch as a film premiere"
piece built on 3–4 brand-locked Veo 3.1 keyframe-pair shots with minimal, elegant type.
Proves LaunchReel isn't only loud pop; it can do restraint. This direction leans hardest
on the gen stack — it doubles as our best-practices probe for Veo.

## Hook (0.0–2.5s)
Darkness → a single projector beam cuts across the frame (dust motes drifting in it).
Type, small, serif-adjacent, centered: **"Some products get a post."** …beat…
**"Yours gets a premiere."**

## Beats (each Veo shot 4–6s, muted, type overlaid in Remotion)
1. **0–6s — THE BEAM (Veo #1):** first frame: dark theater, one projector beam, faint
   dust; last frame: same framing, beam brighter, a cream-glowing screen edge entering
   frame-bottom. Motion prompt: "slow dolly forward through drifting dust toward the
   glow, no text, cinematic." Type overlay: the two hook lines.
2. **6–12s — COALESCE (Veo #2, the saas-motion hero recipe):** cream/yellow abstract
   light field → UI cards converging toward center (first/last per the skill's Hook
   template, brand palette `#FFF3D6`/`#FFC93C`/`#FF3D8B`). Type: "A crew of five builds
   your trailer." then "Scout. Strategist. Director. Renderer. Publisher." in small caps.
3. **12–18s — THE REEL (Remotion, deterministic):** a filmstrip of REAL product frames
   (mock screenshots in film-frame sprocket chrome) pulled through the beam — this is the
   mandatory "product doing the thing" beat, so it stays sharp in Remotion. Slow pan,
   letterboxed 2.35:1 for this beat only.
4. **18–24s — MARQUEE (Veo #3):** first frame: unlit theater marquee at dusk, blank
   sign; last frame: same marquee, bulbs lit warm. Motion: "marquee bulbs flicker on one
   by one, warm glow spreads, locked-off camera." Overlay type ON the blank sign area
   (Remotion, tracked to a fixed region): **"YOUR NAME HERE."**
5. **24–30s — end-card (Remotion):** black → cream card: wordmark, "Every launch
   deserves an opening night." `launchreel.xyz` · "Free teaser → ₹999 full trailer".
   Small: "Built at the GrowthX × Hermes Buildathon."

## VO (intimate, cinematic, gpt-4o-mini-tts `fable` or gcp `Charon`, instructions: "quiet, warm, film-trailer gravitas, slow")
"You didn't build this in a weekend. Don't launch it in a sentence. Five agents. Thirty
seconds. One opening night. LaunchReel."

## Music
Lyria: "slow cinematic build, warm strings and felt piano, subtle tape hiss, 70bpm,
intimate to grand, resolves gently" (abstract only — the filter blocks style references).

## Technique & budget notes
- Keyframes: gpt-image-2 (`--quality medium` for these — they're hero frames), last
  frames via `image-edit.ts` composition-preserving edits. Match aspect: crop pairs to
  16:9 BEFORE submitting (skill §Step-2 warning re letterboxing).
- Veo: `keyframe-video.py --backend vertex --project iofold-gcp --duration 6 --aspect
  16:9 --resolution 720p` → upscale-fit 720p clips to 1080p canvas (they're soft-focus
  beds; acceptable). Mute Veo audio. Budget ≈ 3 clips × $0.60 + keyframes ≈ **$2.20** (cap $4).
- If a Veo shot comes back with warped geometry after 2 attempts, replace it with a
  Remotion-animated version of its FIRST keyframe (Ken-Burns + particles) — never ship a
  bad gen shot for the aesthetic direction whose whole point is polish.
- Grade: slight film grain + vignette over Veo beats; none on the end-card.
