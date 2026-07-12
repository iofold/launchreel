# Launch plan — URL-first intake + YC batch pre-render stunt

Status: proposed 2026-07-12 (buildathon day). Companion to the intake/dashboard work in the main pane.

## Problem

The current intake is upload-first: users are expected to bring screenshots/logo. Public users won't do
that work before they've seen value. Invert it: **paste a URL, get a trailer** — Scout scrapes and
researches everything itself. Uploads become an optional "override our picks" step.

## A. URL-first public flow (Scout does the work)

For any job with a `url`, Scout runs three cheap calls:

1. **Site fetch — Linkup `POST https://api.linkup.so/v1/fetch`**
   `{ url, renderJs: true, extractImages: true }` → clean page markdown (headlines, copy, tone)
   plus extracted image URLs (logo, og:image, hero shots). ~$0.001–0.005/call.
2. **Screenshots — Cloudflare Browser Rendering REST API** (`/screenshot` endpoint; Cloudflare is
   already a power-up). Full-page + hero-viewport PNG → R2 → `jobs.assetRefs`. This replaces the
   user-uploaded screenshots entirely.
3. **Context search — Linkup `POST /v1/search`**
   `{ q: "<company> <domain> — what they do, audience, social proof, recent launch news", depth:
   "standard", outputType: "structured", structuredOutputSchema: … }` → a strategist brief:
   `{ productName, oneLiner, category, audience, keyFeatures[], socialProof[], tone, brandAdjectives[] }`.
   ~$0.005/call standard; reserve `depth: "deep"` ($0.05) for paid tiers.

Brief + assets feed the Strategist (storyboard) unchanged. The `research` job status already exists
in the schema — this fills it with real work.

### Schema/API deltas (small)

- `jobs.brief: v.optional(v.any())` — Scout's structured output.
- `/api/order`: accept URL-only orders — `email` + `url` required, `productName`/`oneLiner` optional
  (placeholder from domain until Scout fills them). Jobs with a `url` enter `research`, not `queued`.
- `jobs.userId` becomes `v.optional(v.id("users"))` — needed for batch-seeded jobs below.

## B. Launch stunt: pre-render the current YC batch

**"We already made your launch trailer."** Seed jobs for every company in the current YC batch, render
them all, put them on the TV as a channel-surfable gallery, and let founders claim theirs.

- **Data source:** yc-oss static JSON mirror of YC's directory (free, no auth):
  - Summer 2026 (current batch, mid-session): **92 companies** — `https://yc-oss.github.io/api/batches/summer-2026.json`
  - Spring 2026 (complete): **197** — `https://yc-oss.github.io/api/batches/spring-2026.json`
  - Verified fields per record: `name`, `website`, `one_liner`, `small_logo_thumb_url`, `industry`, `status`.
    Scout's inputs are pre-filled; it only adds screenshots + the Linkup brief.
- **Seeding:** internal mutation (`orders.seedBatch`) creating jobs with `source: "yc_batch"` and **no
  user row**. Integrity rule: seeded jobs must NOT create users or `signup` events — the scoreboard
  stays honest. The conversion event is the claim: founder enters email → user created → `signup` +
  `teaser_claimed` events → job linked (`userId` patched) → upsell to `pack`.
- **Delivery:** watermarked render + "claim your trailer" endcard/CTA. Buildathon TV doubles as
  **"YC S26 TV"** — program guide of all 92 trailers.
- **Outreach:** tweet/DM each company its trailer link. Stagger; start with the hero set, don't blast 92 at once.

### Costs & throughput

- Linkup for all of S26: 92 × (~$0.006 fetch + ~$0.005 search) ≈ **~$1**. Both batches ≈ $3–4. Negligible.
- The real constraint is **render throughput**. Measure one Remotion render first; at ~2 min/video,
  92 ≈ 3 h on one worker. For the demo: hero set of 10–20 (recognizable names, good-looking sites),
  queue drains the rest in the background.

## Sequencing (today)

1. **Scout action** (Linkup fetch + search, CF screenshot → R2) — core differentiator, feeds both flows.
2. **Intake flip** to URL-first; uploads demoted to optional.
3. **Batch seeder** (`scripts/seed-yc-batch.ts` → seedBatch) + claim wiring on TV.
4. **Outreach** once hero renders exist.

## Open questions

- S26 (92, topical — "your batch is launching right now") vs also X26 (197, volume). Recommend S26 only today.
- Takedown path for founders who don't want a video up (trivial: unlist on request; assets are all public info).
- Keys needed: `LINKUP_API_KEY` (app.linkup.so — $20/mo recurring free credit), Cloudflare API token with
  Browser Rendering, R2 bucket for assets/renders.
