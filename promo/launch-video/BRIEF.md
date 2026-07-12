# LaunchReel launch video — master brief

We are dogfooding: LaunchReel makes 30-second launch trailers, so LaunchReel's own launch
trailer must be the best ad for itself. Six directions are built in parallel; the winner
(or a cut-down of several) ships on **launchreel.xyz** and X.

## Product truth (don't drift from this)

- **What it is:** paste a URL (or drop assets) → an agent crew makes a branded 30-sec
  launch trailer with voiceover, in minutes.
- **The crew:** Scout (brand research) → Strategist (creative brief) → Director
  (storyboard) → Renderer (motion + VO) → Publisher (premiere page).
- **Offer ladder:** Free watermarked teaser → **₹999** Launch Trailer → **₹2,999** Content
  Pack (trailer + 3 social posts + OG images + hero copy).
- **CTA (all videos):** `launchreel.xyz` — "paste your URL, get a free teaser."
- **Audience:** founders/indie hackers who ship products but fumble the launch moment.

## Brand

Tokens live in `remotion/src/lib/brand.ts` — cream `#FFF3D6`, paper `#FFFDF4`, ink
`#17130D`, yellow `#FFC93C`, pink `#FF3D8B`, blue `#2F5BFF`, green `#20C077`, purple
`#7C4DFF`, orange `#FF6B2C`, sky `#CDE7FF`. Style: neo-brutalist pop — thick ink borders,
hard offset shadows, sticker/emoji energy, broadcast-TV motifs (ON AIR bug, channel
numbers, program guide). Reference screenshots of the shipped UI:
`remotion/public/assets/*.png`. A direction may deliberately depart from the pop style
(e.g. premium-film) but the end-card always lands back on brand.

## Hook & offer rules (non-negotiable)

1. **First 2 seconds must arrest** — pattern interrupt, no logo intro, no slow fade-in.
2. **Design for sound-off.** Every word of VO that matters also appears as type. X autoplay is muted.
3. **Show the product doing the thing** at least once (real UI, not abstraction).
4. **One CTA**, ≥2.5s end-card: wordmark + `launchreel.xyz` + "Free teaser" line. Price
   ₹999 appears somewhere as an anchor.
5. **30.0s total** (900 frames @30fps). Loop-friendly last frame is a bonus.
6. Numbers must be honest — no fake "10,000 founders" claims. "Built at the GrowthX ×
   Hermes Buildathon" is a legitimate, verifiable flex.

## Render rules (from skills/saas-motion-workflow — read it)

- **All text, UI, metrics, CTA → Remotion.** Never through a generative video model.
- Gen-video (Veo 3.1 keyframe-pair) is for abstract/atmospheric motion beds only, muted,
  composited under Remotion type via `<OffthreadVideo>`.
- Keyframe pairs: gpt-image-2 for text-adjacent/brand-locked stills, FLUX for pure texture.
  Derive the last frame from the first with `image-edit.ts` (composition-preserving).
- Music: Lyria (`skills/gcp-genmedia/scripts/music-generate.py`, ~$0.04/30s). Describe
  key/tempo/mood abstractly — artist references trip its copyright filter.
- VO: `skills/openai-genai-assets/scripts/tts.ts` (gpt-4o-mini-tts, tone-steerable) or
  `skills/gcp-genmedia/scripts/tts-generate.py`. Mix in Remotion `<Audio>`; duck music
  under VO (volume 0.25–0.4 during speech).
- Veo via `skills/saas-motion-workflow/scripts/keyframe-video.py 
  --backend vertex --project iofold-gcp` (GCP credits). Budget: **≤ $4 Veo per direction**;
  most directions need 0–2 clips. Keys: `set -a; . ops/hermes/.env; set +a` (never echo values).

## Workspace contract (per direction agent)

- Edit **only** `remotion/src/directions/<your-slug>/` and `remotion/public/gen/<your-slug>/`.
  Never touch package.json, Root.tsx, brand.ts, other directions, git, or Convex.
  Exception: your one `<Composition>` line in Root.tsx if your duration ≠ 900.
- Render: `cd promo/launch-video/remotion && npx remotion render src/index.ts <CompId>
  out/<NN-slug>.mp4` (concurrency is capped at 2 in remotion.config.ts — leave it).
- **Verify like an editor, not a compiler:** after each render, extract ~6 spread frames
  (`ffmpeg -i out/x.mp4 -vf fps=1/5 f%02d.png`) and actually look at them. Check: hook
  frame at 1s, type legibility at glance distance, brand colors, end-card. Iterate at
  least twice. Check audio with `ffprobe` (stream present, ~30s duration).
- Report back: what you built, gen assets + cost, self-critique, path to final MP4.
