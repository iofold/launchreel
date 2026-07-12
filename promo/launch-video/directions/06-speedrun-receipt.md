# Direction 06 — 0:47 · speedrun receipt (real-time proof)

**Comp:** `SpeedrunReceipt` · slug `speedrun-receipt` · out `out/06-speedrun-receipt.mp4`
**Vibe:** the proof one. "Watch us make a launch trailer before this video ends." A
speedrun timer runs the whole 30s while the REAL product flow happens — intake → crew →
delivery — and a receipt prints the offer. SFX-led (keyboard, ticks, printer, ding), no VO.
Ruthlessly concrete: this is the direction that makes people believe the "in minutes" claim.

## Hook (0.0–2.0s)
White-hot yellow title card, giant ink type: **"LAUNCH TRAILER — ANY% SPEEDRUN"** with a
speedrun-style timer `00:00.00` top-right that STARTS immediately (frames tick visibly).
SFX: a single starting-gun click. The running timer is the retention device — nobody
scrolls away from a running timer.

## Beats (timer runs continuously top-right, monospace, always visible)
1. **0–2s** — title card + timer start.
2. **2–8s — INTAKE (rebuilt UI, pixel-crisp):** cursor moves (eased, human-imperfect),
   clicks the URL field, TYPES `ledgerly.app` keystroke-by-keystroke (keys clack), clicks
   tier "₹999 Launch Trailer", SLAMS "🚀 Make my trailer". Button does the mock's hard-
   shadow press animation.
3. **8–20s — THE CREW WORKS (job board, statuses are the drama):** five agent chips
   flip waiting→working→done in sequence with real status-feed lines scrolling underneath
   ("Scout: palette #2F5BFF locked", "Director: scene 4/6 boarded", "Renderer: VO take 2
   mixed"…). Storyboard thumbnails pop in 1-by-1. Timer accelerates the tension — add
   subtle tick SFX each status flip. Time-lapse conceit: small "×8 speed" chip near timer
   (honesty + lets 4 minutes fit in 12 seconds).
4. **20–25s — DELIVERY at 00:47.21 (timer freezes, big):** "Your reel is ready 🎉"
   recreation; trailer plays in a picture-in-picture TV frame; DING. Timer stamps
   **PB! 00:47.21** with a little confetti burst.
5. **25–30s — THE RECEIPT (end-card):** a dot-matrix receipt prints downward (printer
   SFX), monospace: "1× LAUNCH TRAILER … ₹999 / VO + music … incl. / premiere page …
   incl. / your standup costs more … ✓" then tear-off animation revealing wordmark +
   `launchreel.xyz` + "Free teaser: paste your URL." QR block on the receipt stub.

## VO — none. SFX carry it (clacks, ticks, ding, printer). All meaning is on-screen.

## Music
Lyria: "driving lo-fi electronic with steady ticking hi-hats, 128bpm, focused, montage
energy, clean ending hit" — the DING at 20s should land on the final hit; edit accordingly.

## Technique notes
- Rebuild intake/job-board/delivery UI natively in React from `public/assets/full-*.png`
  references (same CSS vars in brand.ts) — crispness is the whole point here. Screenshots
  only as reference, except inside the small PiP trailer frame.
- Cursor: an SVG pointer with spring physics between targets + click ripple (toolkit's
  director.js pattern, reimplemented in Remotion).
- Timer: derive mm:ss.ff from `useCurrentFrame()` (during ×8 section multiply); freeze-
  frame stamp effect at PB moment.
- Typing: reveal chars on a frame schedule with 1–2 frame jitter; caret blink.
- SFX: synthesize clicks/ticks as tiny sine/noise WAVs with ffmpeg or python (stdlib
  wave) into public/gen/speedrun-receipt/ — keep each ≤50ms, subtle. Printer = filtered noise burst.
- Zero gen-video. This one's free. Budget: $0.05 (music only).
