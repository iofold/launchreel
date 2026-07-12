# LaunchReel end-to-end journey test

The single journey LaunchReel promises: **a URL goes in, a very good launch trailer comes
out.** This file defines that journey as a test, marks which steps run **today** vs which are
**blocked**, and gives the exact commands for the runnable prefix. The eval set it runs
against is `eval/test-cases.json` (8 YC-S26 companies); the quality bar is `eval/rubric.md`;
the automated gate is `eval/scripts/frame-qa.py`.

## The journey (happy path)

```
URL ──▶ /api/order ──▶ [research: Scout] ──▶ [storyboard] ──▶ [voiceover] ──▶ [rendering]
                                                                                   │
                                          frame-qa scorecard ◀── poster+video ◀────┘
                                                   │
                              verdict ≥ threshold ─┴─▶ awaiting_approval ──▶ delivered ──▶ TV
```

Convex job status walks: `queued → research → storyboard → voiceover → rendering →
awaiting_approval → delivered` (from `convex/orders.ts` / `agent/worker.py`). The eval asserts
a real artifact exists at the end (video file + poster + premiere entry + Convex events) and
that `frame-qa` clears the stills gate before the approval step.

## Step status: runnable TODAY vs blocked

Live deployment probed 2026-07-12: `kindhearted-fish-695.convex.site`, `/api/order` returns
204 (preflight) / 400 (invalid body) — endpoint live.

| # | Step | Status today | What it needs |
|---|------|--------------|---------------|
| 0 | Pick test case from `eval/test-cases.json` | ✅ runnable | none — file is ready, 8 cases verified live |
| 1 | Place order via `/api/order` (full form: email+productName+oneLiner+tier) | ✅ runnable | live Convex (confirmed) |
| 1b | Place **URL-only** order (email+url) | ⛔ blocked | Convex URL-first delta (scout-intake task #3): accept url-only, enter `research` not `queued` |
| 2 | Worker claim + status plumbing (`queued→…→awaiting_approval`) | ✅ runnable (stages pass-through) | worker + `WORKER_KEY`; stages log-and-pass per `worker.py` |
| 3 | **Scout research** (Linkup fetch+search, CF screenshot → R2 → brief) | ⛔ blocked | `agent/scout.py` (scout-intake task #1, in progress); `LINKUP_API_KEY` present, CF token + R2 needed |
| 4 | Storyboard (6-scene JSON from brief) | ⛔ blocked | storyboard stage wiring; templates exist in `skills/saas-motion-workflow` |
| 5 | Voiceover (ElevenLabs / gpt-4o-mini-tts) | ⛔ blocked | voiceover stage wiring; `ELEVENLABS_API_KEY` present |
| 6 | **Rendering** (Remotion comp + optional Veo b-roll) | ⛔ blocked | **Remotion composition not built yet** — the critical path blocker |
| 7 | **frame-qa gate** (scorecard ≥ threshold) | ✅ runnable | built + smoke-tested; runs on any mp4 today |
| 8 | Approval gate → `delivered` | ✅ runnable (manual) | operator/gateway flips status via `/api/worker/update` |
| 9 | Premiere page / Buildathon-TV entry | ⛔ blocked | delivery wiring (poster+premiere entry) |

**Runnable prefix today:** steps 0, 1, 2 (plumbing), **7** (the quality gate), and 8. The
generative middle (3-6) is stubbed/blocked; the render (6) is the load-bearing blocker for a
real end-to-end trailer. **The gate itself (7) is fully runnable and proven** — so the moment a
render lands, the journey closes.

## Runnable commands

### Step 7 — the quality gate (proven today)

The one step that fully works end-to-end right now. Run it on any trailer/clip mp4:

```bash
cd /home/ubuntu/workspace/launchreel
# free tier (watermark expected); add --brand-json for gate-grade brand fidelity,
# --expect-url https://<site> to check the CTA URL, --tier paid to require NO watermark.
python3 eval/scripts/frame-qa.py \
  --video /path/to/trailer.mp4 \
  --frames 8 --tier free \
  --out /path/to/trailer.frameqa.json
# exit prints scores + VERDICT (pass|fail|needs_human); scorecard JSON at --out.
```

Proven on the two sample clips (scorecards saved next to each video):
```bash
python3 eval/scripts/frame-qa.py --video /home/ubuntu/workspace/manifold/.tmp/genai-samples/keyframe/dashboard-assemble.mp4 --out /home/ubuntu/workspace/manifold/.tmp/genai-samples/keyframe/dashboard-assemble.frameqa.json
python3 eval/scripts/frame-qa.py --video /home/ubuntu/workspace/manifold/.tmp/genai-samples/gcp/veo31-fast-launch.mp4 --out /home/ubuntu/workspace/manifold/.tmp/genai-samples/gcp/veo31-fast-launch.frameqa.json
```
Both correctly returned `fail` (auto-fail on smeared text / hallucinated UI) — the gate working as designed.

### Step 1 — place an order (live; writes a real job — use a test email)

```bash
SITE=$(grep -E '^CONVEX_SITE_URL=' .env.local | cut -d= -f2- | tr -d '"'"'"'"')
curl -s -X POST "$SITE/api/order" -H 'Content-Type: application/json' -d '{
  "email":"eval+screenpipe@launchreel.test",
  "productName":"screenpipe",
  "oneLiner":"Capture how you work and turn that into agents",
  "url":"https://screenpipe.com",
  "tier":"teaser"
}'
# -> {"jobId":"…","userId":"…","isNewUser":true}. Job enters status "queued".
```
(A read-only probe that writes nothing: `curl -X POST "$SITE/api/order" -d '{}'` → `400 valid email required`.)

### Step 2 — worker plumbing (walks a job through the stubbed stages)

```bash
# Requires WORKER_KEY set in the Convex deployment env and exported here.
cd /home/ubuntu/workspace/launchreel
CONVEX_SITE_URL="$SITE" WORKER_KEY="$WORKER_KEY" WORKER_ID=eval-lane python3 agent/worker.py
# Claims the queued job, walks research→storyboard→voiceover→rendering→awaiting_approval
# (stages are log-and-pass until scout/storyboard/render land), then parks at the approval gate.
```

## Full end-to-end (blocked until render lands)

Once **step 6 (Remotion comp)** and **step 3 (Scout)** are wired, the full journey per test case is:

1. Seed/place the job from a `eval/test-cases.json` entry (URL-only once step 1b lands).
2. Worker runs research → storyboard → voiceover → rendering, producing `video.mp4` + poster.
3. `frame-qa.py --video video.mp4 --brand-json <scout-brief-palette> --expect-url <site> --tier free` → scorecard.
4. Gate: `verdict == pass` (stills clear) **and** a human/video-level check of scene-contract + motion + VO (the three non-still dimensions) → advance to `delivered`; `fail` → re-render (one revision, then human).
5. Assert delivery artifacts: Convex job `delivered` with `videoUrl`+`posterUrl`, `job_created` event present, premiere/TV entry exists.

Acceptance for the journey test = **all 5 hero cases reach `delivered` with a rig `pass` and no auto-fail**, and the 3 hard cases either deliver honest degraded trailers (no hallucinated UI) or fail gracefully with a logged reason — never a smeared/hallucinated ship.
