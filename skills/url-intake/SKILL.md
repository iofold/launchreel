---
name: url-intake
description: Scout — URL-first intake for LaunchReel. Given a product URL, scrape the site (Linkup fetch), research a strategist brief (Linkup structured search), and capture real UI screenshots (agent-browser) into a job bundle the render worker consumes. Use when a job has a `url` and no uploaded assets.
---

# Scout — URL-first intake

Paste a URL, get a trailer. Scout does the research the customer would otherwise
do by hand: it scrapes the site, writes a structured strategist brief, and
captures real UI screenshots. The output bundle feeds the Strategist
(storyboard) and the deterministic Remotion renderer unchanged.

**Real UI screenshots are scene assets, not gen-video inputs.** Per the AGENTS.md
pipeline contract, real product UI is composited directly by Remotion (Product
Tour scenes); Veo/gen-video is the premium b-roll layer only. Scout produces the
real-UI stills.

## Run it

```bash
python3 skills/url-intake/scripts/scout.py --url https://linear.app --out-dir ./out
# options:
#   --depth standard|deep     Linkup search depth (default standard; reserve deep for paid tiers)
#   --no-screenshots          skip agent-browser; still emit brief + og:image fallback
#   --session <name>          agent-browser session name (default derived from out-dir basename)
```

Dependency-free (Python 3 stdlib only). Reads `LINKUP_API_KEY` from the
environment, or auto-loads it from `.env` / `.env.local` in the repo root. The
key is never printed.

Exit code `0` when the brief and/or page markdown were produced (screenshots are
best-effort); `1` on a hard failure (missing key, or both Linkup calls failed).

## Output bundle

Written to `--out-dir`:

| File | What |
|------|------|
| `page.md` | Clean page markdown from Linkup fetch (headlines, copy, tone) |
| `images.json` | Extracted image URLs: `[{alt, url}]` (logo, og:image, hero shots) |
| `brief.json` | Structured strategist brief (schema below) |
| `desktop-hero.png` | 1440×900 hero viewport @2x — Product Tour scene A |
| `desktop-full.png` | 1440-wide full-page scroll capture @2x |
| `mobile.png` | 390×844 mobile viewport @2x |
| `hero-fallback.{png,jpg}` | Only when live screenshots fail (og:image / first extracted image) |
| `manifest.json` | Ties it together: `url`, `fetchedAt`, `files`, `screenshots[]`, `brief` summary, `warnings[]` |

The worker consumes `manifest.json` first: `brief` for the storyboard, the
`screenshots[]` (or `heroFallback`) for Product Tour scene assets, `page.md`
for extra copy. Any degradation is recorded in `manifest.warnings`, never fatal.

## Linkup API — shapes VERIFIED live 2026-07-12

Base URL `https://api.linkup.so`. Auth header `Authorization: Bearer $LINKUP_API_KEY`.

### `POST /v1/fetch`

Request:
```json
{ "url": "https://linear.app", "renderJs": true, "extractImages": true }
```
Response (verified): `{ "markdown": "…", "images": [ {"alt": "…", "url": "https://…"} ] }`.
Optional `includeRawHtml: true` adds `rawHtml`. On linear.app: 200, 15.7k markdown
chars, 25 images.

### `POST /v1/search` (structured)

Request:
```json
{
  "q": "<product> (<domain>) — what it does, audience, features, social proof, tone",
  "depth": "standard",
  "outputType": "structured",
  "structuredOutputSchema": "<JSON-STRINGIFIED schema, root must be an object>",
  "includeSources": false
}
```
Gotcha: `structuredOutputSchema` is a **JSON string**, not an object, and its root
must be `type: "object"`. With `includeSources: false` the response **is the schema
object at the top level** (no wrapper). With `includeSources: true` it becomes
`{ data, sources }`. Scout uses `false`.

Brief schema Scout requests:
```json
{ "productName", "oneLiner", "category", "audience",
  "keyFeatures": [], "socialProof": [], "tone", "brandAdjectives": [] }
```
`productName` is guaranteed — if the model omits it, Scout fills a Title-Case
placeholder derived from the domain (`linear.app` → `Linear`).

### Cost (measured)

Credits balance drops ~**$0.011 per URL** (one `standard` fetch + one `standard`
search), verified against `GET /v1/credits/balance` before/after. `--depth deep`
raises the search leg to ~$0.05. Budget for a full YC S26 batch (92 sites) ≈ **$1**.
Check balance: `curl -s https://api.linkup.so/v1/credits/balance -H "Authorization: Bearer $LINKUP_API_KEY"`.

## Screenshots — agent-browser

Scout drives the `agent-browser` CLI (no Playwright/Puppeteer dep). Sequence per
viewport: `set viewport W H 2` → `open`/`reload` → `wait 2600` (settle entrance
animations/fonts) → `screenshot [--full]`. Each Scout run uses its own
`--session`, so parallel workers never collide on one browser.

**Container Chrome fix (important):** headless Chrome fails to cold-launch where
unprivileged user namespaces are disabled (Ubuntu 23.10+, most containers/CI) —
`FATAL: No usable sandbox`. agent-browser has no persistent flag for this, so
Scout writes a one-line wrapper to `$TMPDIR` and points
`AGENT_BROWSER_EXECUTABLE_PATH` at it; the wrapper re-invokes the resolved Chrome
with `--no-sandbox --disable-dev-shm-usage`. It auto-resolves Chrome from
`~/.agent-browser/browsers/chrome-*/chrome` (newest), or honors a pre-set
`AGENT_BROWSER_EXECUTABLE_PATH`. If you see `DevToolsActivePort` launch errors
outside Scout, that's the same cause: `agent-browser doctor` reports it.

### Fallback chain (hero still)

When live screenshots fail (no agent-browser, headless Chrome unavailable, nav
timeout), Scout still delivers a hero image without spending Linkup credits:

1. **agent-browser screenshots** — primary (real desktop + mobile UI).
2. **`og:image` / `twitter:image`** — parsed from a direct HTML GET of the URL,
   downloaded as `hero-fallback.*`.
3. **First extracted image** from Linkup `images.json`.

Every fallback path is recorded in `manifest.warnings` so the worker/dashboard
can show what degraded. Screenshots failing never fail the job — the brief is the
load-bearing output.

## How the worker consumes it

`agent/worker.py` research stage: for a claimed job with a `url`, run Scout into a
per-job dir, then `POST /api/worker/brief` with `manifest.brief` (or the full
`brief.json`) to attach it to the job. Screenshots/manifest stay on disk for the
storyboard + render stages. Jobs with no `url` keep the log-and-pass behavior.
