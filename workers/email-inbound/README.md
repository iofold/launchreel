# launchreel-email-inbound — Cloudflare inbound Email Worker

Receives mail sent to **`reel@ctxmill.com`** and POSTs `{from, subject, text}` to
Convex `/api/email/inbound`, which upserts the sender (`source:"email"`) and logs
an `email_inbound` event. This is LaunchReel's inbound ordering/reply channel.

## Why ctxmill.com

Cloudflare Email Routing is **already enabled** on `ctxmill.com` (MX →
`route{1,2,3}.mx.cloudflare.net`), and it hosts no real mailbox, so adding a
worker rule is safe and additive. `iofold.com` is **off-limits** — its apex MX is
Google Workspace (`yash@iofold.com`); enabling Email Routing there would hijack it.
`updates.iofold.com` is Resend/SES inbound (hnic-uw-agents). `theappbin.com` is Zoho.

## Deployed state (2026-07-12)

Already live on account `b26e4af8b7631a2c8d99476fd7bce974` (`yash@iofold.com` OAuth):

- Worker `launchreel-email-inbound` deployed (`src/index.mjs`).
- Var `CONVEX_SITE_URL=https://kindhearted-fish-695.convex.site`.
- Secret `EMAIL_WEBHOOK_KEY` set = the Convex `WORKER_KEY` (Convex's `emailAuthed`
  falls back to `WORKER_KEY`, so they match with no extra Convex env).
- Email Routing rule on `ctxmill.com`: `reel@ctxmill.com` → this worker
  (rule id `206f5588e50745969ad5f50655cb1e70`, enabled).

Verified: `/api/email/inbound` returns 401 on a bad key and 400 on an invalid
`from` (auth + validation both live). A real email to `reel@ctxmill.com` now flows
end-to-end.

## Reproduce / redeploy

```bash
cd workers/email-inbound
# 1. deploy the worker (OAuth session; unset any minted token so OAuth is used)
env -u CLOUDFLARE_API_TOKEN CI=1 npx wrangler deploy
# 2. set the shared secret (must equal Convex WORKER_KEY or EMAIL_WEBHOOK_KEY)
printf '%s' "$WORKER_KEY" | npx wrangler secret put EMAIL_WEBHOOK_KEY --name launchreel-email-inbound
# 3. create the routing rule (CF API; token needs email_routing:write)
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/<ctxmill-zone-id>/email/routing/rules" \
  --data '{"actions":[{"type":"worker","value":["launchreel-email-inbound"]}],
           "matchers":[{"type":"literal","field":"to","value":"reel@ctxmill.com"}],
           "enabled":true,"name":"launchreel-inbound","priority":10}'
```

## Same thing via the dashboard (if you prefer clicks)

1. **Workers & Pages** → deploy `src/index.mjs` as `launchreel-email-inbound`; add
   var `CONVEX_SITE_URL` and secret `EMAIL_WEBHOOK_KEY`.
2. **ctxmill.com → Email → Email Routing → Routing rules → Create rule**: custom
   address `reel@ctxmill.com`, action **Send to a Worker → launchreel-email-inbound**.

## Notes

- Body parsing is dependency-free and best-effort (subject from headers; first
  `text/plain` part heuristically decoded). Swap in `postal-mime` if you need rich
  MIME parsing.
- `FORWARD_TO` (optional var) also forwards raw mail to a **verified** Email Routing
  destination address — leave unset unless you add one.
