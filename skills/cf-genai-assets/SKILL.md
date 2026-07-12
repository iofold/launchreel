---
name: cf-genai-assets
description: Generate image and voice (TTS) assets via Cloudflare Workers AI (FLUX image models + Deepgram Aura voice) with dependency-free bash+curl scripts. Cloudflare has no video models — image and voice only.
---

# cf-genai-assets — Cloudflare Workers AI image & voice generation

Generate **image** and **voice/TTS** assets from the Cloudflare Workers AI REST API.
Dependency-free scripts (`bash` + `curl` + `python3` for JSON/base64) take a prompt and an
output path and write a file. Credentials come from environment variable **names** only.

**Verified working end-to-end 2026-07-12** (via wrangler OAuth session): FLUX.1-schnell,
FLUX.2-klein-4b, Deepgram Aura-1/Aura-2 TTS. See "What works" below.

## Auth — two paths

Workers AI REST calls need `Authorization: Bearer <token>` where the token carries the **`ai`**
scope, plus the account id in the path. Two ways to get that token:

### Path A — wrangler OAuth session (works today, no token minting)

If `npx wrangler login` has been run on the box and the OAuth token carries the `ai` scope
(`npx wrangler whoami` lists scopes), the scripts work with **zero extra setup** via the wrapper:

```bash
cd skills/cf-genai-assets/scripts
./with-wrangler-oauth.sh ./cf-image.sh -p "a red fox" -o fox.png
./with-wrangler-oauth.sh ./cf-tts.sh   -t "hello there" -o hi.mp3
```

`with-wrangler-oauth.sh` refreshes and reads the OAuth bearer from
`~/.config/.wrangler/config/default.toml` and derives the account id from `whoami`, exporting
`CLOUDFLARE_API_TOKEN` + `CF_ACCOUNT_ID` for the wrapped command. **Tradeoff:** the OAuth token is
short-lived (~1h, auto-refreshed on use), tied to the interactively-logged-in account, and depends
on the wrangler config being present — fine for a dev box or a hackathon, **not ideal for unattended
cron/headless** (no browser to re-auth if the refresh token lapses).

### Path B — minted API token (durable, best for headless)

Mint a token with **`Workers AI` → Read + Run** (dash → My Profile → API Tokens → Create Token →
"Workers AI" template), scoped to the target account, and set env vars directly:

```
CLOUDFLARE_API_TOKEN   # token with Workers AI Read+Run
CF_ACCOUNT_ID          # 32-char account id (CLOUDFLARE_ACCOUNT_ID also accepted)
```
```bash
set -a; . /path/to/.env; set +a       # load without echoing values
./cf-image.sh -p "a red fox" -o fox.png
```

The scripts are identical across both paths — only where the bearer comes from differs.

> ⚠️ The `CLOUDFLARE_API_TOKEN` previously in `~/workspace/iofold/.env` is **dead** (401 "Invalid API
> Token" on `/tokens/verify`, 403/401 on Workers AI — verified 2026-07-12). It is a different account
> (`CF_ACCOUNT_ID` there ≠ the OAuth account below) and needs re-minting per Path B. Until then, use
> Path A. Note: routing through the AI Gateway does **not** bypass this — the gateway still needs a
> valid underlying Workers AI token.

REST endpoint both scripts hit:
```
POST https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL_ID}
```

## What works (verified 2026-07-12)

Account used: `b26e4af8b7631a2c8d99476fd7bce974` (wrangler OAuth, email yash@iofold.com).
Neurons bill at **$0.011 / 1,000 Neurons**, **10,000 Neurons/day free**.

| Modality | Model ID | Status | Latency | ≈ Cost / asset |
| --- | --- | --- | --- | --- |
| Image (fast) | `@cf/black-forest-labs/flux-1-schnell` | ✅ works | ~2.3s (1024², 4-6 steps) | ~$0.002 |
| Image (quality) | `@cf/black-forest-labs/flux-2-klein-4b` | ✅ works | ~2-3s (1024²) | ~$0.001–0.005 |
| Voice / TTS | `@cf/deepgram/aura-1` | ✅ works | ~1s (short line) | ~$0.001 (68 chars) |
| Voice / TTS | `@cf/deepgram/aura-2-en` (also `aura-2-es`) | ✅ works | ~1s | ~$0.002 (68 chars) |
| Voice / TTS | `@cf/myshell-ai/melotts` | ❌ **500 server-side** (code 3043) | — | (cheapest on paper, currently down) |
| STT | `@cf/openai/whisper-large-v3-turbo` | (available) | — | $0.0005/audio-min |

Full smoke run generated 2 schnell + 2 klein images and 4 Aura clips; **total spend well under
$0.05.** Sample assets: `.tmp/genai-samples/cloudflare/` (schnell-launchreel.png, script-klein4b.jpg,
aura1-ledgerly.mp3, aura2-ledgerly.mp3, wrap-*).

### Model / request-shape notes (learned from live testing)

- **flux-1-schnell** — JSON body `{"prompt","steps"(≤8),"seed"}`; returns JSON `{result:{image:<base64
  JPEG>}}`. Output is **JPEG even if you name the file `.png`** (it's real JPEG bytes).
- **flux-2 (klein-4b / klein-9b / dev)** — require a **multipart/form-data** body (JSON returns
  `400 "required properties are 'multipart'"`). Fields: `prompt`, `width`, `height`, optional
  `steps`/`seed`. Returns JSON `{result:{image:<base64>}}`. `cf-image.sh` auto-switches to multipart
  when the model id contains `flux-2`. Pricing: klein-4b $0.000059/input-tile + $0.000287/output-tile;
  klein-9b $0.015/first MP; dev ~$0.03–0.05 (best quality, non-commercial weights but hosted API is fine).
- **melotts** — request shape is `{"prompt","lang"}` (confirmed via schema: a `text` field 400s asking
  for `prompt`), but every call returned **HTTP 500 Internal server error (code 3043)** on 2026-07-12,
  including trivial input. Treated as a Cloudflare-side outage; **default TTS is aura-1** until it recovers.
- **Deepgram Aura** — request `{"text","speaker"?}`; **streams raw `audio/mpeg` bytes** (not base64
  JSON). `cf-tts.sh` auto-detects: `{` → JSON+base64 decode, else save raw bytes. aura-1 $0.015/1k
  chars, aura-2-en/es $0.030/1k chars.
- **No video.** Workers AI hosts **zero** text-to-video models. Image + voice + STT + LLMs only. For AI
  video use GCP Vertex (Veo) or fal.ai — see `ops/artifacts/content/hermes-buildathon-plan/genai-stack.html`.

## Usage

```bash
cd skills/cf-genai-assets/scripts

# With wrangler OAuth (prefix the wrapper); or drop it if CLOUDFLARE_API_TOKEN+CF_ACCOUNT_ID are set.
./with-wrangler-oauth.sh ./cf-image.sh \
  --prompt "bold minimal motion-graphics poster frame for a SaaS launch trailer, deep teal background, coral accent, abstract product UI shapes" \
  --out frame.png --steps 6 --seed 42

# Higher-quality FLUX.2 (script sends multipart automatically)
./with-wrangler-oauth.sh ./cf-image.sh -p "sleek isometric dashboard hero, teal + coral" \
  -o hero.jpg -m @cf/black-forest-labs/flux-2-klein-4b

# Voice — Deepgram Aura (default aura-1)
./with-wrangler-oauth.sh ./cf-tts.sh \
  --text "Ledgerly. Bookkeeping on autopilot. Your launch trailer, in minutes." --out vo.mp3

# Aura-2 for a different voice
./with-wrangler-oauth.sh ./cf-tts.sh -t "LaunchReel." -o vo2.mp3 -m @cf/deepgram/aura-2-en
```

Both generators: read creds from env, take `--prompt/--text` + `--out`, print the written path + byte
count on success, and on failure print the exact HTTP status and error body then exit non-zero.
Run any script with `--help` for full flags. `wrangler ai models list` enumerates the live catalog.

## Caveats summary

- Needs a token with the `ai` scope (OAuth session or minted API token). The old iofold `.env` token
  is dead — see the auth note above.
- The wrangler OAuth path is a dev/hackathon convenience; mint a scoped API token for durable headless use.
- flux-1-schnell emits JPEG bytes regardless of the output filename extension.
- flux-2 models need multipart (handled); melotts is down (defaults route around it); no video on CF.
- Never commit or echo token values.

## Files

- `scripts/cf-image.sh` — text-to-image (FLUX.1 JSON / FLUX.2 multipart / SDXL); auto-detects JSON-base64 vs raw-byte responses.
- `scripts/cf-tts.sh` — text-to-speech (Deepgram Aura default, MeloTTS optional); same auto-detect.
- `scripts/with-wrangler-oauth.sh` — turnkey wrapper: injects the wrangler OAuth bearer + account id, then execs the given script.
