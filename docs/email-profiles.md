# Per-customer profiles (email-keyed)

Email is LaunchReel's primary channel and its **identity key**. Every surface —
the web app, inbound email, a reply on a delivered trailer — resolves to the same
customer by email, so we get continuity without accounts or logins.

There are two layers, with different jobs:

## 1. Convex — system of record (the funnel)

Already email-keyed; nothing new to add here.

- **`users`** — one row per email (`by_email` index). `source` records where we
  first saw them: `landing` | `qr_claim` | `tv_claim` | `telegram` | `email`.
- **`jobs`** — linked to a user by `userId` (email indirection). Seeded `yc_batch`
  jobs have no user until a founder **claims** with their email.
- **`events`** — the funnel timeline, keyed by `userId`/`jobId`: `signup`,
  `first_use_started`, `job_created`, `job_claimed`, `payment_recorded`,
  `teaser_claimed`, and now **`email_inbound`** (an inbound email, with the parsed
  subject/text in `meta`).
- **`payments`** — revenue, by user.

This is the honest scoreboard (`orders.scoreboard`). It answers "how many signups,
first-uses, deliveries, revenue" — numbers we can always show in the dashboard.
Integrity rule stays: seeded jobs never create users or signups; the conversion is
the claim. An inbound email **is** a real human contact, so `emailInbound` upserts
a `users` row (`source:"email"`) + `signup` — consistent with the other capture
paths.

## 2. Hermes — working memory (the continuity)

A richer, mutable profile doc per customer email, held by the gateway/worker in
`HERMES_HOME` (the persisted volume). This is agent memory, not the funnel — it's
what makes a returning customer feel known.

- **Code:** `agent/profiles.py` — `read_profile(email)` / `update_profile(email, patch)`.
- **Storage:** one JSON per email under `PROFILES_DIR` (default
  `$HERMES_HOME/profiles`, i.e. `/opt/data/profiles` in the container, or
  `~/.launchreel-hermes/profiles` on the host). Filename is a slug of the email.
- **Shape:**

  ```json
  {
    "email": "founder@acme.com",
    "brandBrief": { "productName": "...", "tone": "...", "brandAdjectives": ["..."] },
    "tierHistory": ["teaser", "trailer"],
    "revisionCount": 1,
    "tone": "punchy",
    "brandAdjectives": ["bold", "playful"],
    "notes": "prefers no stock footage",
    "createdAt": 0, "updatedAt": 0
  }
  ```

- **Merge semantics:** `update_profile` shallow-merges; `tierHistory` **appends**
  (str or list), `revisionCount` accepts `"+1"` to increment, everything else
  overwrites. Writes are atomic (temp file + `os.replace`).

### Who writes it

- **Worker, at claim:** stamp `brandBrief` from Scout's `brief.json` and append the
  `tier` to `tierHistory` for the job's owner email.
- **Worker/gateway, at delivery:** bump `revisionCount` when a revision is requested
  (one free revision, then human escalation — per `AGENTS.md`).
- **Gateway, on inbound reply:** when `email_inbound` fires, append a `note` or
  update `tone` from what the customer said, so the next trailer matches their voice.

The worker call is best-effort: a profile write must never fail a render job (same
rule as the email send).

## How the two relate

Convex is the durable, queryable record of **what happened** (orders, funnel,
revenue). The profile doc is the agent's **memory of who this customer is** (brand,
voice, history) — cheap to read at the top of any job so the output is on-brand and
continuous. Both are looked up by the same lowercase email, so a customer who first
arrives via the web app and later just replies to a delivery email is one identity
end-to-end.
