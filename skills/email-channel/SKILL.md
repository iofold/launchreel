---
name: email-channel
description: LaunchReel's email channel — outbound transactional email (order confirmation, trailer delivered) via Resend, and inbound ordering/replies via Cloudflare Email Routing. Use when sending customer email or wiring the inbound email pipeline.
---

# LaunchReel email channel

Email is LaunchReel's **primary customer channel** (Telegram is demoted — most
customers aren't on it). This skill covers both directions.

## Outbound — Resend (works today, any inbox)

`scripts/send-email.ts` (bun, dependency-free) sends templated transactional mail
through Resend's REST API.

```bash
bun run scripts/send-email.ts \
  --to customer@example.com \
  --template order_confirmation \
  --data '{"productName":"Acme","tier":"trailer","jobId":"j_abc","dashboardUrl":"https://launchreel.pages.dev/j/j_abc"}'
```

Templates: `order_confirmation` (fired when a job is claimed) and `delivered`
(fired when a trailer ships). Both render pop-branded HTML **and** a plain-text
fallback. `--dry-run` renders without sending. Prints `{"ok":true,"id":"<msg-id>"}`.

### From / Reply-To (the verified-domain reality)

- **Verified sending domain: `updates.iofold.com`** (Resend, `sending: enabled`).
  It is the only verified domain on the account, so send from it. Any local-part
  on a verified domain is allowed → default From is
  **`LaunchReel <reel@updates.iofold.com>`** (override with `LAUNCHREEL_FROM`).
- Default **Reply-To is `reel@ctxmill.com`** — the Cloudflare inbound address
  (below), so a customer pressing "reply" re-enters the intake pipeline. Override
  with `LAUNCHREEL_REPLY_TO`.
- `RESEND_API_KEY` must be in the environment (shared with hnic-uw-agents; add it
  to `ops/hermes/.env` for the worker). Never commit or echo it.

### Why not Cloudflare for sending

The Workers `send_email` binding can only send to **verified destination
addresses**, not arbitrary customer inboxes. Cloudflare Email Service (broad
transactional sending) is **private beta** and not enabled on this account. So
outbound is Resend-only; Cloudflare owns inbound.

## Inbound — Cloudflare Email Routing (ctxmill.com)

`reel@ctxmill.com` → Cloudflare Email Worker (`workers/email-inbound/`) → POST
`/api/email/inbound` on Convex → upserts the user (`source:"email"`) and logs an
`email_inbound` event. `ctxmill.com` already has Email Routing enabled (MX →
`route{1,2,3}.mx.cloudflare.net`); iofold.com is Google Workspace and must not be
touched. See `workers/email-inbound/README.md` for deploy + routing-rule steps.

## Per-customer profiles

Email is the identity key. Convex `users`/`jobs`/`events` are email-keyed; the
Hermes worker also keeps a per-email profile doc (brand brief, tier history,
revision count, tone) via `agent/profiles.py`. See `docs/email-profiles.md`.

## Files

- `scripts/send-email.ts` — the send script (Resend). Self-contained.
- `../../workers/email-inbound/` — the Cloudflare inbound Email Worker.
- `../../agent/profiles.py` — email-keyed profile read/update stub.
- `../../docs/email-profiles.md` — profile design.
