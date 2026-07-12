#!/usr/bin/env bash
# with-wrangler-oauth.sh — run a command with CLOUDFLARE_API_TOKEN + CF_ACCOUNT_ID
# populated from the local wrangler OAuth session, so cf-image.sh / cf-tts.sh work
# without a separately-minted Workers AI API token.
#
# Usage:
#   with-wrangler-oauth.sh ./cf-image.sh -p "a fox" -o fox.png
#   with-wrangler-oauth.sh ./cf-tts.sh   -t "hello" -o hi.mp3
#
# Requires: a completed `npx wrangler login` whose token carries the `ai` scope.
# Caveat: the OAuth token is short-lived (~1h) and tied to the logged-in account;
# for durable/headless use, mint a scoped Workers AI API token instead (see SKILL.md).
set -euo pipefail

CFG="${WRANGLER_CONFIG:-$HOME/.config/.wrangler/config/default.toml}"
[ -f "$CFG" ] || { echo "with-wrangler-oauth: no wrangler config at $CFG (run: npx wrangler login)" >&2; exit 1; }

# Refresh the OAuth token (wrangler rewrites a fresh oauth_token to the config).
# Must run with CLOUDFLARE_API_TOKEN unset, or wrangler prefers that env token.
if command -v npx >/dev/null 2>&1; then
  env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN CI=1 WRANGLER_SEND_METRICS=false \
    npx wrangler whoami >/tmp/.wrangler_whoami.$$ 2>/dev/null || true
fi

TOKEN="$(python3 -c "import re;m=re.search(r'oauth_token\s*=\s*\"([^\"]+)\"',open('$CFG').read());print(m.group(1) if m else '')")"
[ -n "$TOKEN" ] || { echo "with-wrangler-oauth: no oauth_token found in $CFG" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN="$TOKEN"

# Derive the account id from whoami output unless the caller already set one.
if [ -z "${CF_ACCOUNT_ID:-}" ] && [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  acct="$(grep -oE '[0-9a-f]{32}' /tmp/.wrangler_whoami.$$ 2>/dev/null | head -1 || true)"
  [ -n "$acct" ] && export CF_ACCOUNT_ID="$acct"
fi
rm -f /tmp/.wrangler_whoami.$$

[ -n "${CF_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}" ] || {
  echo "with-wrangler-oauth: could not determine account id; set CF_ACCOUNT_ID" >&2; exit 1; }

exec "$@"
