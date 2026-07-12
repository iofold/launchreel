---
name: gcp-genmedia
description: Generate premium video (Veo 3.1), images (Imagen 4 / Nano Banana Pro), music (Lyria 3), and narration (Gemini TTS) via Google Vertex AI — the only path that draws GCP credits — with a Gemini-API fallback and dependency-free Python scripts.
---

# gcp-genmedia — Google Veo / image / music / TTS generation

Dependency-free Python (stdlib only) scripts that generate b-roll video, still images,
music beds, and voiceover from Google's generative-media models. Every script supports
**two backends**:

| backend | host | billing | when |
| --- | --- | --- | --- |
| **`vertex`** (preferred) | `aiplatform.googleapis.com` | **draws GCP credits** | production / cost-sensitive |
| `gemini` (fallback) | `generativelanguage.googleapis.com` | Gemini API account — **NOT credits** | proving models, or when Vertex auth is blocked |

> ⚠️ **Credits caveat.** GCP promotional credits only cover the **Vertex** path.
> The Gemini-API key path works identically model-for-model but is billed to the Gemini
> account and does **not** consume GCP credits. Prefer `--backend vertex` whenever a
> `cloud-platform`-scoped token is available.

## Environment status — VERTEX VERIFIED 2026-07-12 (dev1 box)

- **✅ Vertex works end-to-end on project `iofold-gcp`, region `us-central1`.** Verified with
  the restored `yash@iofold.com` user creds (`gcloud auth print-access-token`, `cloud-platform`
  scope). Billing is live (account `0143AB-DC7546-6D1BA0`). Confirmed by actually generating,
  through `--backend vertex`:
  - **Video** — `veo-3.1-lite-generate-001` `predictLongRunning` → 4 s · 1280×720 · H.264+AAC,
    ~20–55 s, ≈ $0.20. Poll via `:fetchPredictOperation`; result in
    `response.videos[0].bytesBase64Encoded`.
  - **Image** — `gemini-2.5-flash-image` `generateContent` → 1024×1024 PNG, ~9 s.
- **⚠️ Model-ID scheme differs between backends.** On **Vertex** Veo uses **GA `-001`** ids
  (`veo-3.1-fast-generate-001`, `veo-3.1-lite-generate-001`, `veo-3.1-generate-001`); the
  **Gemini API** uses `-preview` ids for the same models. `veo-generate.py` now auto-selects
  the right default per backend.
- **⚠️ Some media models are NOT enabled for `iofold-gcp` on Vertex** — they return
  `404 NOT_FOUND "…or your project does not have access to it"` (a Model-Garden access gate,
  not a bug): the **Imagen family** (`imagen-4.0-*`, `imagen-3.0-*` via `:predict`),
  `gemini-3-pro-image`, and `nano-banana-pro-preview`. Working substitutes on Vertex today:
  `gemini-2.5-flash-image` for stills, `veo-3.1-*-001` for video. To use Imagen/Nano-Banana-Pro
  on Vertex, enable them in Model Garden for the project first (console/one-time, may require
  accepting model terms).
- **Auth gotcha (historical, now resolved):** before reauth, user creds failed
  `invalid_grant: invalid_rapt` (iofold.com session-control) and the GCE compute-default SA
  token lacked `cloud-platform`. If it recurs, run `gcloud auth login` again.
- **Gemini-API path also validated end-to-end for all five modalities** (key in
  `ops/hermes/.env` as `GEMINI_API_KEY`) — see the fallback rows below. `--backend auto`
  checks the token scope and picks `vertex` when a `cloud-platform` token exists, else `gemini`.
- **generateContent needs `role:"user"`** on Vertex (the Gemini API is lax); all scripts send it.

## Verified model IDs, latency & pricing

Pricing = **Vertex list price** (the credit-eligible target). Gemini-API list prices are in
the same ballpark but slightly higher for Veo (~$0.15/s fast, audio incl.).

**Verified on Vertex (`--backend vertex`, project `iofold-gcp` / `us-central1`, drawing GCP credits):**

| Modality | Vertex model ID | Verb | Output (observed) | Latency | Vertex price |
| --- | --- | --- | --- | --- | --- |
| Video | `veo-3.1-lite-generate-001` | `predictLongRunning` | 4s · 1280×720 · H.264+AAC (audio incl.) · 2.4–2.8 MB | ~20–55 s | ~$0.05/s |
| Video | `veo-3.1-fast-generate-001` | `predictLongRunning` | (id validated; GA) | ~50–70 s | $0.10/s |
| Video | `veo-3.1-generate-001` (Standard) | `predictLongRunning` | (GA; premium tier) | — | $0.40/s audio · $0.20/s silent |
| Image | `gemini-2.5-flash-image` | `generateContent` | 1024×1024 PNG · 1.1 MB | ~9 s | ~$0.04/img |

Veo on Vertex: lengths 4/6/8 s, 720p/1080p (4K output on Standard), 16:9 or 9:16, **us-central1 only**.
Also selectable on Vertex: `veo-3.0-*`, `veo-2.0-generate-001`.

**Verified on the Gemini API (`--backend gemini`, key billing — NOT GCP credits):**

| Modality | Gemini-API model ID | Verb | Output (observed) | Latency | Vertex-equiv price |
| --- | --- | --- | --- | --- | --- |
| Video | `veo-3.1-fast-generate-preview` | `predictLongRunning` | 8s · 1280×720 · H.264+AAC · 7.4 MB | ~70 s | $0.10/s |
| Video | `veo-3.1-lite-generate-preview` | `predictLongRunning` | 8s · 1280×720 · H.264+AAC · 5.2 MB | ~49 s | ~$0.05/s |
| Image | `imagen-4.0-fast-generate-001` | `predict` | 1408×768 PNG · 1.2 MB | ~5 s | ~$0.02/img |
| Image | `nano-banana-pro-preview` | `generateContent` | 1408×768 JPEG · 0.7 MB | ~20 s | $0.134 (1–2K) · $0.24 (4K) |
| Music | `lyria-3-clip-preview` | `generateContent` | 30.8 s MP3 · 44.1 kHz stereo · 0.74 MB | ~12 s | $0.04 / 30 s |
| TTS | `gemini-3.1-flash-tts-preview` | `generateContent` | L16 PCM 24 kHz mono → WAV | ~4 s | ~$1.80/hr (~$30/1M chars) |

> **On `iofold-gcp` Vertex today, Imagen (`imagen-4.0-*` via `:predict`), `gemini-3-pro-image`,
> and `nano-banana-pro-preview` return 404 "does not have access"** — enable them in Model
> Garden for the project to use them on the credit-eligible path; otherwise use them via the
> Gemini API, or use `gemini-2.5-flash-image` on Vertex.
> **Imagen 4 retires 2026-08-17** — prefer the Nano Banana / `gemini-*-image` lineage anyway.

## Auth setup

**Vertex (preferred):** the scripts call `gcloud auth print-access-token` and need a
`cloud-platform`-scoped token plus a project id.

```bash
gcloud auth login                       # once, interactively (fixes invalid_rapt)
export GENMEDIA_PROJECT=iofold-gcp      # project with credits + aiplatform enabled
export GENMEDIA_REGION=us-central1      # default
export GENMEDIA_BACKEND=vertex          # force vertex (or leave unset for auto)
```

`aiplatform.googleapis.com` must be enabled on the project (it is on `iofold-gcp`).
Optional overrides: `GENMEDIA_GCLOUD_ACCOUNT` (which account to mint the token for),
`GOOGLE_OAUTH_ACCESS_TOKEN` (supply a token directly, skipping gcloud).

**Gemini fallback:** export a key (name only — never commit/echo the value):

```bash
export GEMINI_API_KEY=...    # or GOOGLE_API_KEY ; sourced from ops/hermes/.env here
export GENMEDIA_BACKEND=gemini
```

`--backend auto` (default) picks `vertex` **only** when a `cloud-platform`-scoped token is
obtainable, else `gemini` — so a scope-limited metadata token won't cause a 403.

## Usage

```bash
# Vertex (credit-eligible) — GA "-001" model ids, gemini-*-image for stills:
scripts/veo-generate.py "PROMPT" --out clip.mp4 --backend vertex \
    --project iofold-gcp --model veo-3.1-fast-generate-001 --duration 8
scripts/image-generate.py "PROMPT" --out hero.png --backend vertex \
    --project iofold-gcp --model gemini-2.5-flash-image

# Gemini API (fallback) — "-preview" video ids, Imagen/Nano-Banana available here:
scripts/veo-generate.py "PROMPT" --out clip.mp4 \
    --model veo-3.1-fast-generate-preview --aspect 16:9 --resolution 720p
scripts/image-generate.py "PROMPT" --out hero.png \
    --model imagen-4.0-fast-generate-001 --aspect 16:9 --count 1
scripts/image-generate.py "PROMPT" --out hero.png --model nano-banana-pro-preview

scripts/music-generate.py "PROMPT" --out bed.mp3 --model lyria-3-clip-preview
scripts/tts-generate.py "Say in a warm announcer voice: Your launch trailer, in minutes." \
    --out vo.wav --voice Charon
```

Every script takes `--backend {auto,vertex,gemini}`, `--project`, `--region`, prints the
saved path to stdout, logs progress/errors to stderr, and exits non-zero on failure with
the verbatim HTTP status + error body. Only `python3` (stdlib) is required — no pip installs,
no `gcloud` unless you use the Vertex backend.

## Veo long-running-operation (LRO) polling pattern

Veo is asynchronous. Both backends follow the same three phases; `veo-generate.py` implements
both.

**Gemini API**
1. `POST /v1beta/models/{model}:predictLongRunning` with
   `{"instances":[{"prompt":"…"}],"parameters":{"aspectRatio":"16:9","resolution":"720p"}}`
   → returns `{"name":"models/…/operations/…"}`.
2. Poll `GET /v1beta/{operation.name}` until `done:true` (check `error` too).
3. Download `response.generateVideoResponse.generatedSamples[0].video.uri` **with the
   `x-goog-api-key` header** (the URI is auth-gated), or decode `…video.videoBytes`.

**Vertex**
1. `POST …/publishers/google/models/{model}:predictLongRunning` (Bearer token) → `{"name":…}`.
2. Poll `POST …/publishers/google/models/{model}:fetchPredictOperation` with
   `{"operationName":"…"}` until `done:true`.
3. Read `response.videos[0].bytesBase64Encoded` (base64) — or pass
   `parameters.storageUri` to have Veo write the MP4 to a GCS bucket and fetch it there.

Typical wall-clock: **~50–75 s** for an 8-second 720p fast/lite clip. Poll every ~10 s.

## Gotchas learned

- **`generateAudio` is not a Gemini-API parameter** — passing it 400s. Veo 3.1 emits audio
  by default (the observed clips carry a 48 kHz AAC track). On Vertex the audio toggle differs.
- **Duration is fixed at 8 s on the Gemini API** (`durationSeconds` is ignored); Vertex honors
  4–8 s.
- **Lyria has a strict copyright filter** — a "cinematic trailer" style prompt returned
  `finishReason: OTHER` / "resembles existing copyrighted works". Describe
  key/instrumentation/tempo/mood in the abstract; avoid artist/song references. The script
  surfaces the filter message so you can rephrase.
- **Image response shape depends on the model family:** `imagen-*` uses `:predict` →
  `predictions[].bytesBase64Encoded`; Nano-Banana / `gemini-*-image` use `:generateContent`
  → `candidates[0].content.parts[].inlineData`. `image-generate.py` dispatches on the id and
  auto-corrects the extension when the model returns JPEG.
- **TTS returns raw PCM** (`audio/L16;rate=24000`), not a container — `tts-generate.py` wraps
  it into WAV.
