# LaunchReel — agent instructions

You are working in the LaunchReel repo: an AI launch-trailer agency built live at the
GrowthX × Hermes Buildathon (Bangalore, 2026-07-12). Assets/URL in → branded 30-sec
motion-graphics trailer out. Tiers: free watermarked teaser (QR→email claim) · ₹999
Launch Trailer · ₹2,999 Content Pack.

## Map

- `convex/` — order book (source of truth): users/jobs/events/payments, HTTP endpoints
  (`/api/order`, `/api/signup`, `/api/worker/*`). Never report a number the Convex
  dashboard can't show.
- `web/` — customer app (Cloudflare Pages, single file): intake → agent-org dashboard →
  delivery → Buildathon TV. Demo mode when `window.CONVEX_SITE_URL` is unset.
- `agent/worker.py` — pipeline worker (claim → research → storyboard → voiceover →
  rendering → awaiting_approval). Scale via compose `--scale worker=N`. Sends the
  order-confirmation email at claim (`notify` → `skills/email-channel`).
- `skills/email-channel/` — the primary customer channel. Outbound via Resend
  (verified `updates.iofold.com`): `order_confirmation` + `delivered` templates in
  `scripts/send-email.ts`. Inbound via Cloudflare Email Routing: `reel@ctxmill.com`
  → `workers/email-inbound/` → Convex `/api/email/inbound`. Profiles: `docs/email-profiles.md`.
- `ops/hermes/` — contained Hermes stack (gateway + worker pool + dashboard). See its
  README for the parallelism model.
- `skills/` — the generation stack. Read the relevant SKILL.md before generating:
  - `gcp-genmedia` — Veo 3.1 video / stills / Lyria music / TTS. Prefer `--backend
    vertex` (GCP credits); Gemini API is the fallback.
  - `openai-genai-assets` — gpt-image-2 (best legible text; instruction-edit preserves
    composition — use for brand recolors), gpt-4o-mini-tts narrator.
  - `cf-genai-assets` — FLUX stills ~$0.002 (garbles headline text — texture only),
    Deepgram Aura TTS.
  - `saas-motion-workflow` — keyframe-pair → Veo interpolation recipe, per-scene
    prompt templates for the 6-scene storyboard.

## Pipeline contract

Storyboard is a fixed 6-scene JSON (Hook, Problem, Product Tour A, Product Tour B,
Social Proof, CTA). The LLM writes storyboard content, never arbitrary render code.
Renderer is deterministic Remotion; gen-video (Veo) is the premium b-roll layer only.
Every delivered job needs: video file, poster frame, premiere-page entry, and Convex
events (`signup`, `first_use_started`, `job_created`, payment when paid).

## Rules

- Secrets live in `.env` files (gitignored) — never commit or echo them.
- One revision per customer, then human escalation. Approval gate before delivery.
- Watermark stays on free-tier output.
- Commit in small conventional commits; push to `origin master` (linear history).
