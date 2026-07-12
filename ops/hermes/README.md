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

## Operating the gateway

The gateway is the conversational operator: you send it a turn, it thinks with its
configured model (`gpt-5.6-terra` via the `openai-api` provider) and acts with tools
(bash, file I/O, the vendored `skills/`, the repo mounted at `/workspace/launchreel`).

### Auth model (two schemes, one key)

The gateway runs an HTTP API server on `127.0.0.1:8652`. The shared secret is
`API_SERVER_KEY` from `ops/hermes/.env`. **Two surfaces, two header styles** — this is
the thing that trips you up:

| Surface | Path prefix | Auth header |
|---|---|---|
| OpenAI-compatible **agent** endpoint | `/v1/*` | `Authorization: Bearer $API_SERVER_KEY` |
| Hermes **admin** endpoints | `/api/*` | `Authentication: $API_SERVER_KEY` |

`GET /health` is unauthenticated. A bare `hermes` process inside the container talks to
its model, not to this API server — the "Missing Authentication header" 401 is the
model call failing, not the API server (see the gotcha below).

### Run an agent turn against the gateway (primary path)

The gateway exposes the **whole agent as an OpenAI model named `hermes-agent`**. POST a
chat completion and it runs a full tool-using turn, then returns the final message.
This is the path that shows up on the dashboard.

```bash
KEY=$(grep '^API_SERVER_KEY=' ops/hermes/.env | cut -d= -f2- | tr -d '"'\'' \r')
curl -s http://127.0.0.1:8652/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","stream":false,
       "messages":[{"role":"user","content":"Read AGENTS.md and list skills/."}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["choices"][0]["message"]["content"])'
```

A non-empty `content` with `finish_reason: "stop"` = success. If `content` is an error
string and `finish_reason: "error"` (with a `"hermes"` error block), the turn reached
the agent but the agent's own model/tool call failed.

### One-shot / scriptable CLI turn (prints the full transcript)

```bash
docker exec -w /workspace/launchreel launchreel-gateway hermes -z "Reply with PONG."
```

CLI turns share the same `HERMES_HOME` (`/opt/data`), so they land in the same session
store and kanban as the API turns.

### Gotcha: "HTTP 401: Missing Authentication header" from the agent

If a turn comes back with that error, the agent's **model** call is going out with no
valid auth. Root cause seen here: `$HERMES_DATA_DIR/config.yaml` shipped with duplicate
keys in the `model:` block — a leftover template `provider: "auto"` and
`base_url: https://openrouter.ai/api/v1` **below** the intended `provider: openai-api`.
YAML keeps the last duplicate, so the agent auto-detected OpenRouter and sent the OpenAI
key to the wrong host. Fix: comment out the stray `provider:`/`base_url:` lines so the
only live values are `default: gpt-5.6-terra` + `provider: openai-api`, then
`docker restart launchreel-gateway`. Quick workaround without editing config:
`hermes -z "…" --provider openai-api`.

### Inspect the order book (read-only, worker secret)

The gateway holds `WORKER_KEY` + `CONVEX_SITE_URL` in its env. Read-only endpoints:

```bash
# delivered-premieres feed (public)
curl -s -X POST "$CONVEX_SITE_URL/api/tv" -H 'Content-Type: application/json' -d '{}'
# feedback inbox (authenticated read)
curl -s -X POST "$CONVEX_SITE_URL/api/worker/inbox" \
  -H 'Content-Type: application/json' -H "X-Worker-Key: $WORKER_KEY" -d '{"limit":3}'
```

Mutating endpoints (`/api/worker/claim|update|revision|seed`) are the render pipeline —
don't call them by hand.

### Ops kanban board

A `launchreel-ops` board mirrors the live job book (delivered → Done; awaiting-approval
and failed → Blocked/needs_input so the dispatcher never auto-runs them):

```bash
docker exec launchreel-gateway hermes kanban boards list
docker exec launchreel-gateway hermes kanban --board launchreel-ops list --status done
docker exec launchreel-gateway hermes kanban --board launchreel-ops list --status blocked
```

Create tasks in a terminal state so the in-gateway dispatcher can't spawn a worker for
them: `--initial-status blocked` then `complete` for done work, or
`block <id> --kind needs_input "<reason>"` to pin a task in the human-gated column.

### Observability / dashboard

Every turn (API and CLI) is recorded in `$HERMES_DATA_DIR/state.db`. List them:

```bash
docker exec launchreel-gateway hermes sessions list
```

The session dashboard reads that same DB: https://launchreel-dash.dev1.ctxmill.com
(password login, user `yash`), or `http://127.0.0.1:9129` on the box. `api_server`
sessions are the HTTP turns; `cli` sessions are `hermes -z` runs.

## Incident: kanban dispatcher auto-execution (2026-07-12)

**What happened.** The `launchreel-ops` board is meant to be a *display-only mirror*
of the Convex job book (see `ops/hermes/kanban-sync.py`). But this gateway ships with
the in-process kanban dispatcher **on** (`kanban.dispatch_in_gateway: true`,
`auto_decompose: true`, 60s tick). The dispatcher treats every non-terminal card as an
executable task: `auto_decompose` ran an LLM triage that **rewrote the mirror titles into
imperatives** ("[NEEDS APPROVAL] Zomma …" → "Review and approve Zomma teaser"), assigned
them to profile `default`, and the dispatch tick spawned full-tool agent sessions
(`hermes … kanban task <id>`, toolsets incl. terminal/code_execution/web) to *do* them.
The README's "use blocked/terminal states" guidance is **not** sufficient here — cards
left in `blocked` were promoted minutes later.

**Blast radius.** The "review and approve …" runner agents approved **16 real jobs**
(`awaiting_approval → delivered`; delivered 12 → 28). The renders were already complete,
so the cuts were valid — a bypassed approval gate, not data corruption. In parallel the
operator had independently rig-verified (both machines, all `pass`) and approved exactly
those 16, so the flips were **redundant with an authorized approval**; decision was to
**keep them delivered** (no revert). No renders were triggered; in-flight and failed
counts were unchanged; nothing else was mutated.

**Audit — runner cards / sessions (all approvals, no other writes):**

- Runner card IDs (archived): `t_7f63d9e6 t_727b790e t_13d8548d t_99d77268 t_1b1ba975
  t_3bfa1818 t_07c38cee t_aa21567c`
- Runner CLI session IDs (deleted from the dashboard): `20260712_103514_510243
  20260712_103514_b2ea81 20260712_103514_d40811 20260712_103620_e2abfc
  20260712_103620_add717 20260712_103727_b240f4 20260712_103727_f234fd
  20260712_103727_36731e`
- Net effect: 16 jobs flipped `awaiting_approval → delivered` — Care GP, HyperProbe,
  Alloovium, Cerenovus, Zomma, Alkera AI, Nebula Security, Nori, HeadRest, Aura, Ravi,
  Rivane, Log Kya Kahenge, My DARK Secret, Moonshot.hunt, Finn.

**Containment.** Killed all `kanban task` runner processes, archived every dispatchable
card, stopped the sync loop.

**Fix (the rule).** Disable the in-gateway dispatcher whenever this board mirrors
production. In `$HERMES_HOME/config.yaml`:

```yaml
kanban:
  dispatch_in_gateway: false   # no in-gateway auto-dispatch loop
  auto_decompose: false        # no auto-triage/assign of unassigned cards
```

then `docker restart launchreel-gateway`. Verified off: a `ready` card assigned to
`default` sat 90s past the 60s tick with **zero** runners spawned. The dispatcher also
skips *unassigned* tasks, so `kanban-sync.py` keeps every mirror card unassigned as a
second layer. **This gateway must run with kanban dispatch OFF while `launchreel-ops`
mirrors the live job book.** Observe the live book with the Convex feed
(`curl $CONVEX_SITE_URL/api/tv`) or `npx convex data jobs`.

**Final operating posture — belt and suspenders.** The board is left as a **static,
done-only ledger**: every job is a terminal `done` card, with its real pipeline status
carried in the title prefix (`[DELIVERED]` / `[NEEDS APPROVAL]` / `[IN-FLIGHT: <stage>]`
/ `[FAILED]`). Done cards are non-dispatchable even if dispatch were re-enabled (belt);
the config keeps dispatch off (suspenders). The `lr-kanban-sync` tmux loop is
**stopped** — re-run `python3 ops/hermes/kanban-sync.py` by hand to refresh the ledger
after a batch of status changes, and only ever with dispatch OFF.
