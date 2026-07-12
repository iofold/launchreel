# Direction 02 — EXPLODED UI · "47 moving parts. You touch none of them."

**Comp:** `ExplodedUI` · slug `exploded-ui` · out `out/02-exploded-ui.mp4`
**Vibe:** the fancy one — a finished launch trailer torn down as a 3D exploded diagram
(IKEA-manual-meets-motion-design), then reassembled. Precision flex: "look how much craft
goes into 30 seconds — and it's all automated."

## Hook (0.0–2.0s)
A polished mini launch-trailer frame (blue "Still doing books at midnight?" hero from the
delivery screen aesthetic) plays FULL-frame like a normal ad… then a hard freeze +
camera-pull reveals it's a thin plane floating in 3D space. Type stamp:
**"THIS TRAILER HAS 47 MOVING PARTS."**

## Beats
1. **0–4s** — mini-trailer plays → freeze → pull-back reveal (perspective shift).
2. **4–13s — THE EXPLOSION:** the frame separates along z-axis into 8–12 labeled layers
   fanning out: logo plane · 2 screenshot planes · headline type · caption track ·
   VO waveform ribbon · music-beat blocks · color-chip strip · watermark sheet. Slow
   orbital camera. Thin ink leader-lines + small label chips ("SCENE 3/6", "VO — take 2",
   "beat-synced cut", "brand #FFC93C"). This section is the money shot — take your time.
3. **13–19s — WHO ASSEMBLES IT:** the 5 crew avatars slide in along the stack like
   stations on a line; each layer group snaps toward its agent with a stamp animation
   (Scout→screenshots, Strategist→copy, Director→scene order, Renderer→motion+waveform,
   Publisher→premiere frame).
4. **19–25s — IMPLOSION:** everything slams back (reverse, fast, with motion blur) into
   the finished frame; play resumes exactly where it froze; the watermark sheet peels off
   ("₹999 — watermark gone").
5. **25–30s — end-card:** "47 moving parts. You touch none of them. Paste a URL." +
   wordmark + `launchreel.xyz` + free-teaser line.

## VO (calm, precise, gpt-4o-mini-tts `nova`, instructions: "measured, confident, slightly amused product-film narrator")
"A launch trailer is forty-seven decisions. Type. Timing. Color. Cut. Our crew makes all
of them — in minutes. You paste a URL. That's your one moving part. LaunchReel."

## Music
Lyria: "minimal precise electronic, soft ticking percussion, warm pads, 100bpm, builds to
a satisfying resolve" — the implosion should land ON a musical hit (place it manually).

## Technique notes
- `@remotion/three` + `@react-three/fiber` are installed. Layers = textured planes
  (`useVideoTexture` not needed — bake layer bitmaps or render DOM-styled planes via
  drei-less plane + CanvasTexture, OR fake 3D entirely with CSS `perspective` +
  `rotateY/translateZ` if r3f fights you — CSS-3D at 1080p can look just as crisp and is
  easier to keep text sharp. Choose whichever you can make look GOOD, not whichever is fancier.)
- Text must stay razor-sharp: render type as DOM overlays synced to the 3D camera where
  possible; never bake small text into low-res textures.
- Use `public/assets/full-delivery.png` + `mock-3-delivery.png` crops as screenshot-plane
  textures (they're legit product UI).
- Gen assets (optional ≤$1): none required; a FLUX soft-gradient backdrop still is allowed.
- Motion blur on the implosion: `@remotion/motion-blur` `<Trail>`/`<CameraMotionBlur>`.
