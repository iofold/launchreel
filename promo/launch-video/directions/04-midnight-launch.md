# Direction 04 — 2AM · kinetic typography direct-response

**Comp:** `MidnightLaunch` · slug `midnight-launch` · out `out/04-midnight-launch.mp4`
**Vibe:** the dark one. Pure beat-synced kinetic type telling the founder's 2am launch
story, then a violent flip to the pop palette when LaunchReel enters. The most
direct-response of the six: pain → product → price → QR. 100% sound-off safe (it IS text).

## Hook (0.0–2.0s)
Pitch-black screen. A text cursor blinks twice (real timing, ~500ms). Types out, mono
font, white: **"It's 2:14 AM."** No music yet — just a soft keyboard clack. Silence is
the pattern interrupt.

## Beats
1. **0–6s — the confession (dark, mono type, typewriter + hard cuts):**
   "It's 2:14 AM. / Your product ships tomorrow. / Your launch post: / a screenshot. /
   and a prayer. 🙏" — words appear beat-by-beat, scale-punch on "prayer".
2. **6–11s — the damage (numbers hurt):** "14 likes. / 3 are your cofounder. / 1 is your
   mom." — each line harder cut, screen shakes 2px on each landing. Low sub-bass pulses only.
3. **11–13s — THE FLIP:** mid-word hard cut to cream background, music SLAMS in,
   full pop palette: **"There's a crew for this now."** (Optional single Veo flourish:
   dark→cream light-bloom keyframe pair BEHIND the type, ≤$0.60.)
4. **13–22s — the speedrun (product proof, fast):** type + UI fragments alternating:
   "Paste your URL →" (real intake field recreation) → five crew chips light up in
   sequence → storyboard row pops in → "trailer. voiceover. premiere page." each word
   stamped over a matching UI fragment.
5. **22–30s — the offer (slow down, let it land):** offer card centered: "Free teaser —
   tonight. / ₹999 — the full trailer. / You've already done the hard part." →
   end-card: wordmark + `launchreel.xyz` + QR code block + "ship the launch too."

## VO — none. This direction is type + music + SFX only. (If a test view feels empty,
allowed fallback: whispered VO of the dark lines only, gpt-4o-mini-tts `alloy`,
instructions "tired whisper, 2am, intimate" — but try no-VO first; it's braver.)

## Music
Two Lyria cues (or one with a hard edit at 11s):
- dark half: "sparse dark ambient pulse, sub bass heartbeat, 60bpm, tense, minimal"
- pop half: "triumphant bright indie-electronic drop, punchy drums, handclaps, 120bpm"

## Technique notes
- Type is the cinematography: mono font (dark half) vs chunky grotesque (pop half) —
  pick via @remotion/google-fonts (e.g. JetBrains Mono / Archivo Black).
- Beat-sync: define a BEATS array of frame numbers; every cut/punch lands on one; align
  the 11s flip to the music edit.
- Screen-shake: 1–3px random offset for 3–4 frames on landings (seeded, use @remotion/noise).
- QR: generate a real QR to https://launchreel.xyz as SVG (write a tiny generator or use
  a data-matrix of divs from a precomputed matrix — no network deps at render time).
- Keyboard clack + sub pulses: tiny synthesized audio or omit; music can carry it.
