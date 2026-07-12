# LaunchReel

**Your launch trailer, in minutes.** Assets/URL in → branded 30-sec Remotion motion-graphics trailer out, ordered via web or Telegram bot, with a visible agent org (Scout → Strategist → Director → Renderer → Publisher) and Convex as the live-verifiable order book.

Built live on the floor at the GrowthX × Hermes Buildathon, Bangalore, 2026-07-12 (Revenue track). All product code in this repo was written during the event window per the fresh-build rule.

## Architecture

- `convex/` — source of truth: `users`, `jobs`, `events`, `payments` tables; `orders.place` (upsert user + create job + `signup`/`first_use_started` events), `orders.scoreboard` (proof-minute numbers), HTTP endpoints (`/api/order`, `/api/signup`) for the static landing.
- `web/` — Cloudflare Pages app shell (single file, from the winning "Pop Studio × Broadcast TV" mock): intake (upload-first) → agent-org job dashboard (Scout→Strategist→Director→Renderer→Publisher, approval gate) → delivery → Buildathon TV (featured player + program guide, channel surf). Intake posts to `/api/order`, TV claim posts to `/api/signup`; with `window.CONVEX_SITE_URL` unset it runs in demo mode (pipeline theater, no DB writes). "Simulate order" never writes to the DB.
- `render/` — (next block) Remotion render worker polling `orders.nextQueued`; fork of `remotion-dev/template-prompt-to-motion-graphics-saas`.

## Bring-up

```bash
npm install
npx convex dev          # login + provision; keeps schema/functions pushed
# take the https://<name>.convex.site URL it prints →
#   set window.CONVEX_SITE_URL in web/index.html (or a <script> line above the main script)
npx wrangler pages deploy web --project-name launchreel
```

Verification: submit the form → `users`/`jobs` rows + `signup`/`first_use_started`/`job_created` events visible in the Convex dashboard. That dashboard IS the demo counter — never claim a number it can't show.

## Power-ups in play

Convex (order book) · Cloudflare (Pages + R2 for renders) · ElevenLabs (VO) · Linkup (Scout research) · Wispr Flow (build-process dictation, mentor-witnessed).
