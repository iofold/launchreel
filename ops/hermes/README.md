# LaunchReel Hermes stack

Contained agent runtime for LaunchReel: one Hermes **gateway** (the brain), a scalable
**worker** pool (the hands), and an optional session **dashboard** (the observability
surface judges can walk through).

## Bring-up

```bash
cd ops/hermes
cp .env.example .env   # fill it (see comments); set WORKER_KEY in Convex too:
                       #   npx convex env set WORKER_KEY <same-value>
docker compose up -d --build
docker compose --profile dash up -d   # + session dashboard on 127.0.0.1:9129
```

Validate config before restarts: `docker compose config -q`.

## Roles

| Service | Instances | Job |
|---|---|---|
| `gateway` | exactly 1 | Telegram intake, per-company memory, status theater to the customer chat, kanban ops board, spawns subagent sessions for creative/research tasks |
| `worker` | N (`--scale`) | claims queued jobs from Convex, runs the pipeline stages (research → storyboard → voiceover → rendering), parks at the approval gate |
| `dashboard` | 0–1 | pull up any past session/run step-by-step (rubric: observability) |

## How parallel tasks scale

**Scale the hands, not the mouth.**

- The gateway is pinned to one instance because one Telegram bot token supports one
  long-poll consumer, and the customer-facing memory/kanban lives in its `HERMES_HOME`
  volume. It orchestrates; it does not render.
- Parallel work happens in the worker pool: `docker compose up -d --scale worker=4`.
  Workers are stateless (all state in Convex + object storage), so replicas are safe.
- The claim is race-free by construction: `orders.claimNext` is a Convex **mutation**
  (transactional). Two workers claiming at once can't get the same job — the second
  transaction sees `status != queued` and takes the next row. No locks, no queue infra.
- Each stage reports back via `/api/worker/update`, so the gateway (and the Convex
  dashboard — the proof-minute surface) always shows live per-job stage state.
- Burst capacity beyond the box: point extra workers at the same Convex deployment
  from any machine (the 8h GPU box, dev1, a laptop) — same env vars, same claim
  semantics. The pool is wherever `worker.py` runs.
- Inside the gateway, Hermes can additionally spawn **subagent sessions** (research,
  copywriting) tracked on its kanban; those are conversation-scale tasks. The worker
  pool exists for the heavy render lanes that must not block chat.

## Skills

The repo mounts at `/workspace/launchreel`; `AGENTS.md` at the repo root points the
agent at `skills/`:

- `skills/gcp-genmedia` — Veo 3.1 video, stills, Lyria music, TTS (Vertex = credits path)
- `skills/openai-genai-assets` — gpt-image-2 posters + instruction-edit, narrator TTS
- `skills/cf-genai-assets` — FLUX volume stills, Aura TTS (wrangler OAuth or minted token)
- `skills/saas-motion-workflow` — keyframe-pair → Veo interpolation recipe per scene

Skills are vendored copies (this repo must be self-contained for judges); upstream
originals live in the manifold repo.
