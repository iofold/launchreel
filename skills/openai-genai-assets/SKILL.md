---
name: openai-genai-assets
description: Generate poster/still images (gpt-image-2, with instruction-edit) and narrator voiceovers (gpt-4o-mini-tts) via the OpenAI API using dependency-free bun scripts.
---

# OpenAI GenAI Assets

Generate **images** and **voiceover audio** from the OpenAI API for launch trailers,
title cards, posters, and demos. Three dependency-free `bun run` scripts:
`image-gen`, `image-edit` (the differentiator), and `tts`.

- **Images** → `gpt-image-2`: strong instruction-following, text renders legibly, and
  **conversational multi-turn edits** are its stand-out capability.
- **Voice** → `gpt-4o-mini-tts`: cheapest quality TTS (~$0.015/min), tone-steerable via
  an `instructions` prompt. No cloning, no word timestamps.
- **Video** → none. `sora-2` is a **dead end** (see warning below). Use GCP Veo / open
  weights for video; use this skill only for images + voice.

Related sibling skill: **`cf-genai-assets`** (Cloudflare FLUX images + MeloTTS/Aura voice) —
same asset types on a different, credit-capped wallet. Pick per cost/availability.

## Setup

```bash
export OPENAI_API_KEY=sk-...        # required; scripts read env only, never hardcode/print it
bun --version                       # >= 1.x; scripts are pure bun, zero npm install
```

## Quick start

```bash
S=skills/openai-genai-assets/scripts

# 1) fresh image (portrait, budget quality)
bun run $S/image-gen.ts \
  --prompt "bold minimal motion-graphics launch-trailer poster, deep teal bg, coral accent, abstract SaaS UI cards, 9:16" \
  --out poster.png --size 1024x1536 --quality low

# 2) instruction-edit that image (recolor, keep composition) — gpt-image-2's superpower
bun run $S/image-edit.ts \
  --image poster.png \
  --prompt "Recolor to gold and black; keep the composition identical." \
  --out poster_gold.png --size 1024x1536 --quality low

# 3) voiceover
bun run $S/tts.ts \
  --text "Ledgerly. Bookkeeping on autopilot. Your launch trailer, in minutes." \
  --out vo.mp3 --voice onyx --instructions "Confident, energetic launch-trailer narrator."
```

Each script prints progress + `usage` + estimated cost to **stderr**, and a
machine-readable JSON summary (out path, bytes, latency, usage, `est_cost_usd`) to
**stdout** for pipelines.

## Verified model IDs (checked against this key, 2026-07-12)

| Task | Use | Also visible |
|------|-----|--------------|
| Image gen + edit | **`gpt-image-2`** | `gpt-image-2-2026-04-21`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`, `chatgpt-image-latest` |
| Text-to-speech | **`gpt-4o-mini-tts`** | `tts-1`, `tts-1-hd` (legacy, char-billed, no tone steering) |
| Speech-to-text | `whisper-1`, `gpt-4o-transcribe` | `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` |
| Speech-to-speech / realtime | `gpt-audio`, `gpt-realtime*` | — (voice agents, not batch VO) |
| Video | — | `sora-2`, `sora-2-pro` — **DO NOT USE, see warning** |

## ⚠️ Sora is a dead end

`sora-2` / `sora-2-pro` still appear in `/v1/models`, but the **Sora API sunsets
2026-09-24** (the consumer app already closed). Do **not** architect any video path on
OpenAI. For video: GCP Veo 3.1 (Vertex path) for premium, or open weights (Wan 2.2 /
LTX-2) on GCP GPUs. This skill is images + voice only.

## Pricing (verified 2026-07-12) & measured samples

**Images — `gpt-image-2` is token-priced**, not per-image:
`$5.00/1M` text-in · `$8.00/1M` image-in (`$2.00/1M` cached) · `$30.00/1M` image-out.

| Call | Quality | Size | Latency | Out tokens | ~Cost |
|------|---------|------|---------|-----------|-------|
| gen | low | 1024×1536 | 25–32 s | 158 | **$0.005** |
| gen | medium | 1024×1024 | ~52 s | 1756 | **$0.053** |
| gen | high | 1024×1024 | — | — | **~$0.21** (est.) |
| edit | low | 1024×1536, 1 source | 26–31 s | 158 out **+ 1536 in** | **$0.017** |

**Voice — `gpt-4o-mini-tts`**: `$0.60/1M` text-in `+ $12/1M` audio-out ≈ **$0.015/min**.
Measured: a ~5 s line rendered in **1–2.4 s** for **~$0.001**. (The `/audio/speech`
endpoint returns **no** `usage` object — scripts estimate cost from script length; probe
the file with `ffprobe` for exact duration.)

## Knobs that matter

- **Quality dominates cost.** low→medium is ~11× the output tokens (158 → 1756).
  Draft at `low`; only go `medium`/`high` for finals or fine text.
- **Edits cost more than gens.** Every source image is re-read at high fidelity
  (~1536 input tokens per 1024×1536), added on top of the output. Budget ~2–3× a gen.
- **Sizes:** `1024x1024` (square), `1024x1536` (portrait, closest to 9:16),
  `1536x1024` (landscape), or `auto`. There is no true 1080×1920 — render at
  `1024x1536` and upscale/crop downstream if you need exact 9:16.
- **Output is always base64** (`b64_json`); gpt-image has no `url` return mode. Scripts
  decode and write PNG for you.
- **`background: transparent`** works with png/webp output (pass `--background transparent`).
- **TTS voices:** `onyx` (used here — confident narrator), plus `alloy, ash, ballad,
  coral, echo, fable, nova, sage, shimmer, verse`. `--instructions` steers tone on
  `gpt-4o-mini-tts` only (ignored by `tts-1`).
- **TTS formats:** `mp3` (default), `opus`, `aac`, `flac`, `wav`, `pcm`.

## Gotchas discovered

- **Image edits need an explicit MIME type.** Multipart uploads with an untyped blob
  return `HTTP 400 unsupported_mimetype`. Edit inputs must be `image/png`, `image/jpeg`,
  or `image/webp`; the `image-edit.ts` script sets the type from the file extension.
- **No word timestamps / no voice cloning** on `gpt-4o-mini-tts`. If you need
  scene-synced cuts, transcribe the rendered audio with Whisper for word timings, or use
  a timestamped provider (e.g. ElevenLabs `/with-timestamps`).

## Scripts

- `scripts/image-gen.ts` — `--prompt --out [--model --size --quality --background --n]`
- `scripts/image-edit.ts` — `--image (repeatable) --prompt --out [--model --size --quality --mask]`
- `scripts/tts.ts` — `--text|--textfile --out [--model --voice --instructions --format]`
- `scripts/lib.ts` — shared client, pricing table, cost math (imported by the above)

Run any script with `--help` for its flags. All read `OPENAI_API_KEY` from the
environment and never print it.
