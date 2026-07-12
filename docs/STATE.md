# LaunchReel — State of the System

Snapshot: **2026-07-12 ~20:25 UTC** (evening of the GrowthX × Hermes Buildathon build day).
Everything in "Live right now" was verified against the running deployments at snapshot time; the rest is verified against code at `c834acb`.

---

## TL;DR

LaunchReel — assets/URL in → branded 30-sec Remotion trailer out — is **feature-complete end-to-end and proven on live jobs**: URL-first web intake, Scout research, LLM storyboard, VO, deterministic render, vision-rig quality gate with a bounded auto-fix loop, R2 delivery behind a human approval gate, a full email channel (outbound Resend + inbound Cloudflare worker) with an autonomous one-revision feedback loop, two-video compare, and customer preference memory.

The order book stands at **35 jobs / 29 delivered / 14 signups / ₹0 revenue** (payments are simulated). The single biggest operational fact right now: **the render worker pool is down (0 of 2 replicas running)** — a new order placed on launchreel.xyz would sit in `queued` indefinitely, and inbound email replies aren't being drained. Two jobs are additionally orphaned mid-pipeline at `storyboard`.

---

## Live right now (verified at snapshot)

| Surface | State |
|---|---|
| `https://launchreel.xyz` (+ `launchreel.pages.dev`) | **UP** — Cloudflare Pages, single-file app wired to Convex |
| Convex deployment `dev:kindhearted-fish-695` | **UP** — order book live; scoreboard: 14 signups, 14 first-uses, 29 delivered, 0 payments, ₹0 |
| `launchreel-gateway` (dev1 docker, :8652) | **UP 9h, healthy** — Hermes agent as OpenAI model `hermes-agent` |
| `launchreel-dashboard` (dev1 docker, :9129 → `launchreel-dash.dev1.ctxmill.com`) | **UP 10h** |
| **Render workers (`worker` service, replicas: 2)** | **DOWN — 0 containers exist.** Pipeline is dark; email inbox not drained |
| `feedback.py --daemon` | **Not deployed** (was a next-step; worker in-loop inbox drain also down with the pool) |
| Email inbound: `reel@ctxmill.com` → CF worker `launchreel-email-inbound` → Convex | **Deployed & live-verified** (attachment path unit-tested only, see Gaps) |
| Email outbound: Resend from `LaunchReel <reel@updates.iofold.com>` | **Live** (smoke-tested; links use `WEB_BASE_URL=https://launchreel.pages.dev`) |
| R2 `launchreel-renders` → `https://pub-2170a2cdfc494c2abdef1950108bba6c.r2.dev` | **Live** — delivery + inbound-attachment bucket |
| Promo review gallery (was `:8930`) | Down (session-hosted); files remain in `promo/launch-video/remotion/out/web/` |

**Jobs by status** (35 total): 29 `delivered` · 2 `awaiting_approval` · 2 `failed` · 2 `storyboard` (orphaned mid-stage — `claimNext` only picks up `queued`, so these need manual requeue or write-off).
**Jobs by source**: 19 `yc_batch` (batch seeding has partially run) · 10 `waitlist_xyz` · 4 `landing` · 2 other.

---

## Deployment topology

- **Cloudflare** — Pages (`launchreel` project → launchreel.xyz); Email Routing on `ctxmill.com` (`reel@` → worker `launchreel-email-inbound`); R2 bucket `launchreel-renders` (public r2.dev); Workers AI available as a cheap gen backend (FLUX stills, Aura TTS).
- **Convex cloud** — `dev:kindhearted-fish-695` (a *dev* deployment; no prod deployment provisioned). Source of truth for users/jobs/events/payments. Secrets `WORKER_KEY` / `EMAIL_WEBHOOK_KEY` set both in Convex env and `ops/hermes/.env`.
- **dev1 (this box)** — docker compose project `launchreel-agent` (`ops/hermes/`): `gateway` ×1 (Telegram intake, kanban, agent-as-API on 127.0.0.1:8652), `worker` ×N (stateless render lanes, currently 0), `dashboard` (Traefik-exposed). Repo bind-mounted at `/workspace/launchreel` in every container; gateway/dashboard state in `HERMES_DATA_DIR` volume.
- **Third-party** — OpenAI (storyboard/fixpass/feedback/intent LLM `gpt-5-mini`, TTS fallback), ElevenLabs (primary VO), Google Gemini (`gemini-2.5-flash` vision judge; Lyria/Veo via Vertex `iofold-gcp` us-central1), Resend (outbound email), Linkup (Scout fetch/search).

---

## System map

| Dir | What it is |
|---|---|
| `convex/` | Order book: 4 tables, ~23 functions in `orders.ts`, 17 HTTP routes in `http.ts` across 3 auth tiers (public / `X-Worker-Key` / `X-Email-Key`) |
| `web/` | Single-file Pages app (~1.8k lines): URL-first intake, agent-org job board, delivery, Buildathon TV, wall mode `?wall=1`, `#job=` permalinks, demo mode |
| `agent/` | The agent org, 12 Python files ~4.2k LOC: worker lanes + storyboard/VO/deliver/approve/feedback/compare/fixpass/intake-gate/preferences/profiles/record-payment |
| `render/` | Deterministic Remotion 4 renderer — one `Trailer` comp, 1080×1920@30, six fixed scene types, vendored fonts, bundle-once optimization |
| `skills/` | Gen + channel stack: `gcp-genmedia` (Veo/Lyria/TTS via Vertex), `openai-genai-assets` (gpt-image-2, TTS), `cf-genai-assets` (FLUX/Aura), `saas-motion-workflow` (keyframe-pair→Veo recipe), `url-intake` (Scout), `email-channel` (Resend templates) |
| `workers/email-inbound/` | CF Email Worker: postal-mime parse, video attachments → R2 (≤4, 25 MB cap), POST → `/api/email/inbound` |
| `eval/` | Judge rig: `rubric.md` (7 dims, 2 auto-fail), `frame-qa.py` (Gemini stills judge, deterministic verdict), `video-compare.py` (head-to-head, same scoring core), `journey.md` + `test-cases.json` (8 real YC S26 companies) |
| `ops/hermes/` | Contained Hermes stack: compose file, Dockerfile (UID-remapped `nousresearch/hermes-agent`), `kanban-sync.py` (done-only static ledger) |
| `promo/launch-video/` | Six finished dogfood launch videos + gallery + social thumbnails |
| `scripts/seed-yc-batch.ts` | YC batch seeder (yc-oss JSON → `/api/worker/seed`), integrity-safe |
| `docs/` | `launch-plan.md`, `email-profiles.md`, `progress_log.ndjson`, this file |

### Data model (convex/schema.ts)

- **users** — email (identity key), source (`landing|qr_claim|telegram|email|tv_claim`).
- **jobs** — `userId` *optional* (seeded jobs unowned until claimed), tier `teaser|trailer|pack`, 9-state status, `brief` (Scout output), `assetRefs`, `videoUrl`/`posterUrl`, `revisionCount`.
- **events** — free-form funnel log (`signup`, `first_use_started`, `job_created`, `teaser_claimed`, `email_inbound`, `revision_applied`, `payment_recorded`, …).
- **payments** — amountInr, method `razorpay|upi_qr`, evidence.

Email is the identity key across every surface (web order, inbound reply, claim) — see `docs/email-profiles.md`. Durable funnel truth in Convex; mutable per-customer working memory in file-backed `agent/profiles.py` dossiers (+ `preferences.py` distilled prefs, learn→recall→apply into the storyboard prompt).

---

## Pipeline: lifecycle and quality gates

```
queued ──claimNext (atomic)──▶ research ─▶ [awaiting_info] ─▶ storyboard ─▶ voiceover
      ─▶ rendering ──vision rig──▶ deliver (R2) ─▶ awaiting_approval ──approve.py──▶ delivered
                        │ fail                                                        │ reply
                        ▼                                                             ▼
              fixpass → re-render (max 2 attempts)                        feedback.py: ONE auto-revision
                        │ 2nd fail                                        (rev1 → R2 <jobId>/rev1/) then
                        ▼                                                 human escalation
              failed + quality_hold email
```

- **Claim** is a Convex transactional mutation — N worker lanes never collide; extra lanes can run from any machine pointed at the same deployment.
- **Intake gate** (`agent/intake_gate.py`) parks thin owned jobs at `awaiting_info` with 2–4 LLM-drafted questions (`need_info` email); a customer reply folds answers into the brief and requeues (doesn't burn the revision).
- **Storyboard contract**: fixed 6 scenes (hook/problem/tour_a/tour_b/social_proof/cta), LLM writes content only, never render code; dual-validated (JSON Schema + Zod); model ladder `gpt-5-mini → gpt-4o-mini → deterministic fallback` — always produces a valid storyboard. Watermark structurally forced to `tier=="teaser"` and immutable through every merge path.
- **Quality gate** (`eval/scripts/frame-qa.py`): Gemini scores 4 still dimensions; verdict computed *deterministically in-script* (auto-fail if text-legibility or real-UI ≤ 2; ship needs all ≥ 3 and mean ≥ 4.0). Fail → `fixpass.py` makes the smallest storyboard edit that removes the cited defects (may only *remove* bgVideo; can't touch scene order/durations/watermark/audio) → one re-render. Second fail → `failed` + honest `quality_hold` email.
- **Approval gate** is a human tap: `python3 agent/approve.py <jobId>` flips to `delivered` and sends the `delivered` email. Nothing auto-delivers. (Exception: the email revision loop re-delivers rev1 directly — see Gaps.)
- **Revision budget**: exactly one automated revision, enforced belt-and-suspenders (feedback.py check + DB-level refusal in `orders.applyRevision`). Intent classifier spends it only on real change requests; questions get a status reply, acks get silence.
- **Compare**: emailing two videos to `reel@ctxmill.com` triggers `agent/compare.py` → rubric head-to-head → `video_compare` email (proven live: 3.67 vs 5.0).

## Email channel

- **Outbound** (`skills/email-channel/scripts/send-email.ts`, Resend, dependency-free bun): 10 templates — `order_confirmation`, `need_info`, `storyline`, `preview_ready`, `delivered`, `revision_ready`, `quality_hold`, `video_compare`, `style_lab`, `reply`. From `reel@updates.iofold.com` (verified domain), Reply-To `reel@ctxmill.com` — replies re-enter the pipeline.
- **Inbound**: CF Email Routing rule on ctxmill.com → `launchreel-email-inbound` worker → postal-mime parse (dependency-free fallback), video attachments streamed to R2 `inbound/<hash>/`, JSON posted to Convex `/api/email/inbound` with `X-Email-Key`. Never bounces mail.
- **Loop**: workers drain `/api/worker/inbox` between claim polls (single-flight); `feedback.py` also runs standalone (`--once`/`--daemon`). Stage-aware routing: `awaiting_info` answers resume the job; pre-delivery replies requeue with feedback notes; post-delivery replies trigger the one revision.

## Order-book integrity (the demo rules)

- Scoreboard numbers come straight from the DB (`orders.scoreboard`) — never claim a number the Convex dashboard can't show.
- `seedBatch` creates **no user row and no signup event**; the only conversion event is a human claim (`claimJob` → `teaser_claimed`). Seeded YC trailers can never inflate signups.
- Web "Simulate order" is theater-only (DEMO chip shown, no DB write).
- Payments are **simulated** (`record-payment.py`, default evidence `"SIMULATED — free-offer QR"`); the UPI modal on the web is an honest placeholder. Revenue shown: ₹0.

---

## Promo / launch assets

Six finished 30s dogfood launch videos in `promo/launch-video/remotion/out/` (web transcodes + gallery + 6 social thumbnails in `out/web/`): 01 channel-zap, 02 exploded-ui, 03 the-crew, 04 midnight-launch, 05 premium-film (Veo), 06 speedrun-receipt. All frame-audited; QRs in 04/06 decode to launchreel.xyz.

- **Verdict on record**: 01 channel-zap wins, 04 midnight-launch co-winner.
- **Placement recommendation**: 06 → site hero, 01 → X launch post, 02 → demo day, 05 → paid-tier page.
- Field notes captured: Veo 3.1 keyframe-pairs 3/3 first-try on Vertex (~$0.71/bed actual); text must stay in Remotion (gen-video smears it); Lyria 404s on Vertex us-central1 → use `--backend gemini` for music.

## Launch plan status (`docs/launch-plan.md`)

- **Plan A — URL-first intake: DONE.** Web intake is URL-first ("just enter your website"), Scout (Linkup fetch/search + agent-browser screenshots, ~$0.01/URL) fills the brief, `/api/order` accepts URL-only.
- **Plan B — YC S26 pre-render stunt: PARTIALLY RUN.** Seeder built and integrity-safe; 19 `yc_batch` jobs already in the book (most delivered — see incident below). Full batch = 92 companies (~$1 Linkup, ~3h render on one lane). Buildathon TV doubles as the claim surface (`claimJob` = the conversion). Outreach not started.
- Hero/hard eval set: 8 real S26 companies in `eval/test-cases.json` (military/weapons cos explicitly excluded from the public gallery).

---

## Gaps, risks, and stale docs

**Operational (act on these first)**
1. **Worker pool down** — `docker compose -f ops/hermes/docker-compose.yml up -d worker` (scale ≥1) to light the pipeline back up; required anyway to pick up the inbox wiring + fixpass loop shipped after the last worker restart. Deploy `feedback.py --daemon` (or rely on worker in-loop drain).
2. **2 jobs orphaned at `storyboard`** — no re-claim path for non-queued statuses; requeue by hand or mark failed.
3. **2 jobs at `awaiting_approval`** — waiting on an operator `approve.py` tap.
4. Convex is a **dev deployment**; no prod provisioning, and CORS is `*` on all HTTP routes.
5. `EMAIL_WEBHOOK_KEY` falls back to `WORKER_KEY` (`http.ts`) — inbound-email auth currently collapses onto the worker-pool secret (deployed state per worker README).

**Known-untested (flagged in progress log)**
6. Live email **with attachment** through the deployed inbound worker (only local MIME unit tests, 9/9).
7. A real **paid** trailer through the full live loop (payment path was stubbed).
8. Vision-rig `real_ui` judge variance (non-deterministic OffthreadVideo seek) — matters before any auto-approve calibration.

**By-design quirks worth remembering**
9. Email revision re-delivery **bypasses the approval gate** (`applyRevision` sets `delivered` directly).
10. `approve.py --revise` flips status but does **not** re-render — operator recut is manual today.
11. Veo b-roll is **dormant**: `bgVideoPath` exists in both schemas and renders under Hook/CTA, but nothing produces it (fixpass may only remove it). The premium gen-video layer is an unlit feature.
12. `profiles.py` is a file-backed stub — dossiers persist only via `HERMES_HOME` volume; `upsert_company_profile` is dead code.
13. Kanban is a **done-only static ledger** after the 2026-07-12 dispatcher incident (in-gateway dispatcher auto-approved 16 jobs; now `dispatch_in_gateway:false`, cards unassigned, status lives in title prefixes). Don't re-enable the dispatcher.
14. `frame-qa.py` default `--env-file` points into the `manifold` repo — pass `GEMINI_API_KEY` via env under this repo.

**Stale docs to fix when convenient**
15. `eval/journey.md` still calls rendering "not built yet / the critical-path blocker" — it's built and 29 jobs delivered.
16. `skills/email-channel/SKILL.md` documents 2 templates; 10 exist.
17. `workers/email-inbound/README.md` claims dependency-free parsing; postal-mime is the primary path.
18. `README.md` (repo root) still describes intake as upload-first and `render/` as "(next block)".
19. `.env.example` `WEB_BASE_URL=https://launchreel.tv` — domain doesn't resolve; live value is `launchreel.pages.dev`, public brand domain is `launchreel.xyz`.

---

## Operator runbook (quick reference)

```bash
# Light the pipeline (from ops/hermes/)
docker compose up -d --scale worker=2          # workers claim from Convex
docker compose --profile dash up -d dashboard  # observability

# Approve / recut / deliver
python3 agent/approve.py <jobId>               # awaiting_approval -> delivered + email
python3 agent/approve.py <jobId> --revise      # back to storyboard (manual re-render)

# Feedback / inbox
python3 agent/feedback.py --once               # drain inbound email queue

# Seed the YC batch (dry-run first)
bun scripts/seed-yc-batch.ts --batch summer-2026 --limit 10 --dry-run

# Payments (simulated), scoreboard
python3 agent/record-payment.py <jobId> --amount 999
npx convex run orders:scoreboard

# Kanban mirror (safe, done-only)
python3 ops/hermes/kanban-sync.py
```

Secrets: `ops/hermes/.env` (gitignored) + Convex env (`WORKER_KEY`, `EMAIL_WEBHOOK_KEY`). Never commit or echo.
