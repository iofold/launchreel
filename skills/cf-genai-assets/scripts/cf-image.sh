#!/usr/bin/env bash
# cf-image.sh — generate an image via Cloudflare Workers AI (FLUX / Stable Diffusion).
#
# Reads credentials from the environment (never pass secrets on the CLI):
#   CLOUDFLARE_API_TOKEN   API token with "Workers AI" (Read + Run) permission
#   CF_ACCOUNT_ID          Cloudflare account id  (CLOUDFLARE_ACCOUNT_ID also accepted)
#
# Usage:
#   cf-image.sh --prompt "a red fox" --out fox.png
#   cf-image.sh -p "poster frame" -o frame.jpg --model @cf/black-forest-labs/flux-1-schnell --steps 6 --seed 42
#
# Notes:
#   * Default model is flux-1-schnell (cheapest, JSON base64 response).
#   * The script auto-detects the response shape: some Workers AI image models
#     return a JSON envelope {"result":{"image":"<base64>"}}, others stream raw
#     image bytes. Both are handled.
set -euo pipefail

MODEL="@cf/black-forest-labs/flux-1-schnell"
PROMPT=""
OUT=""
STEPS=""
WIDTH=""
HEIGHT=""
SEED=""

die() { echo "cf-image: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--prompt) PROMPT="${2:-}"; shift 2 ;;
    -o|--out)    OUT="${2:-}";    shift 2 ;;
    -m|--model)  MODEL="${2:-}";  shift 2 ;;
    --steps)     STEPS="${2:-}";  shift 2 ;;
    --width)     WIDTH="${2:-}";  shift 2 ;;
    --height)    HEIGHT="${2:-}"; shift 2 ;;
    --seed)      SEED="${2:-}";   shift 2 ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

[ -n "$PROMPT" ] || die "missing --prompt"
[ -n "$OUT" ]    || die "missing --out"
ACCOUNT_ID="${CF_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "CLOUDFLARE_API_TOKEN not set in env"
[ -n "$ACCOUNT_ID" ] || die "CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) not set in env"

url="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}"
raw="$(mktemp)"
trap 'rm -f "$raw"' EXIT

# FLUX.2 models (klein/dev) require a multipart/form-data body; everything else
# (flux-1-schnell, SDXL) takes a JSON body. Both return JSON {result:{image:<base64>}}
# or raw image bytes, handled by the auto-detect below.
if printf '%s' "$MODEL" | grep -q 'flux-2'; then
  set -- -F "prompt=${PROMPT}" -F "width=${WIDTH:-1024}" -F "height=${HEIGHT:-1024}"
  [ -n "$STEPS" ] && set -- "$@" -F "steps=${STEPS}"
  [ -n "$SEED" ]  && set -- "$@" -F "seed=${SEED}"
  code=$(curl -sS -o "$raw" -w '%{http_code}' \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "$@" "$url")
else
  body=$(PROMPT="$PROMPT" STEPS="$STEPS" WIDTH="$WIDTH" HEIGHT="$HEIGHT" SEED="$SEED" python3 - <<'PY'
import json, os
b = {"prompt": os.environ["PROMPT"]}
for k, name, cast in (("STEPS","steps",int),("WIDTH","width",int),("HEIGHT","height",int),("SEED","seed",int)):
    v = os.environ.get(k, "")
    if v != "":
        b[name] = cast(v)
print(json.dumps(b))
PY
)
  code=$(curl -sS -o "$raw" -w '%{http_code}' \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST --data "$body" "$url")
fi

if [ "$code" != "200" ]; then
  echo "cf-image: HTTP $code from Workers AI" >&2
  head -c 800 "$raw" >&2; echo >&2
  exit 1
fi

# Auto-detect: JSON envelope (base64 in .result.image) vs raw image bytes.
first=$(head -c 1 "$raw")
if [ "$first" = "{" ]; then
  python3 - "$raw" "$OUT" <<'PY'
import base64, json, sys
raw, out = sys.argv[1], sys.argv[2]
d = json.load(open(raw))
img = (d.get("result") or {}).get("image") or d.get("image")
if not img:
    sys.stderr.write("cf-image: no image field in JSON response: %s\n" % json.dumps(d)[:400])
    sys.exit(1)
open(out, "wb").write(base64.b64decode(img))
PY
else
  cp "$raw" "$OUT"
fi

bytes=$(wc -c < "$OUT" | tr -d ' ')
echo "cf-image: wrote $OUT ($bytes bytes) via $MODEL"
