# Direction 01 — CHANNEL ZAP · "Your launch deserves primetime"

**Comp:** `ChannelZap` · slug `channel-zap` · out `out/01-channel-zap.mp4`
**Vibe:** retro broadcast TV — channel-surfing, static glitches, SMPTE bars, TV chrome.
The product's own Buildathon-TV metaphor turned into the whole ad. Loud, fast, fun.

## Hook (0.0–2.0s)
Hard cut into full-screen analog static (noise you generate procedurally or via
@remotion/noise) + a violent channel-zap SFX beat. SMPTE color bars SLAM in remapped to
the brand palette. Stamped over them in huge ink type: **"YOUR LAUNCH DESERVES PRIMETIME."**

## Beats
1. **0–3s** — static → brand SMPTE bars → headline stamp. Channel bug "CH 00" top-right.
2. **3–8s — CH 01 "THE SAD LAUNCH"** (desaturated, 4:3 pillarboxed, VHS grain): a lonely
   tweet card — "we're live 🚀" · 14 likes — flickering on a dead channel. Lower-third
   ticker: "BREAKING: six months of work, one screenshot…". ZAP.
3. **8–16s — CH 02–04, quick zaps** (each ~2.5s, full pop palette): CH 02 intake screen
   ("PASTE A URL" flashing like a game show), CH 03 the crew pipeline as a live control
   room (5 agent chips lighting up in sequence), CH 04 a finished trailer playing inside a
   TV frame with ON AIR bug. Between channels: 4–6 frame glitch/static transitions.
4. **16–23s — THE GUIDE:** Buildathon-TV program guide fills up with premieres (rows
   animate in staggered); one row highlighted: "YOURS — TONIGHT 21:00". Ticker shows the
   offer: "FREE TEASER · ₹999 FULL TRAILER".
5. **23–30s — SIGN-OFF end-card:** TV powers down to a scanline dot, pops back as the
   LaunchReel wordmark in a TV-set frame + "Every launch premieres here." +
   `launchreel.xyz` + "Paste your URL → free teaser". Last frame loop-friendly.

## VO (energetic TV announcer, gpt-4o-mini-tts `onyx`, instructions: "excited retro TV announcer, fast, warm")
"Tonight! The launch you spent six months building… gets fourteen likes? Change the
channel. Paste your URL — five agents make your trailer while you watch. LaunchReel.
Every launch deserves primetime."

## Music & SFX
Lyria: "upbeat retro broadcast synth theme, bright brass stabs, 120bpm, major key,
game-show energy, clean mix". SFX: zap/static bursts between channels (synthesize with
short noise bursts in Remotion audio or skip — visual glitch alone reads fine).

## Technique notes
- CRT feel: scanline overlay (repeating-linear-gradient), slight barrel edge vignette,
  1–2px RGB channel offset on transitions only (keep body text clean).
- TV chrome components: channel bug, ON AIR pill, lower-third ticker (marquee), 4:3 mask.
- Rebuild UI moments natively from `public/assets/full-*.png` references — don't paste
  blurry screenshots for hero moments; screenshots are OK inside small TV frames.
- Gen assets (optional, ≤$1): FLUX texture for VHS grain still. Everything else Remotion.
