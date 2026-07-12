#!/usr/bin/env bash
# cf-tts.sh — synthesize speech via Cloudflare Workers AI text-to-speech.
#
# Reads credentials from the environment (never pass secrets on the CLI):
#   CLOUDFLARE_API_TOKEN   API token with "Workers AI" (Read + Run) permission
#   CF_ACCOUNT_ID          Cloudflare account id  (CLOUDFLARE_ACCOUNT_ID also accepted)
#
# Usage:
#   cf-tts.sh --text "Ledgerly. Bookkeeping on autopilot." --out vo.mp3
#   cf-tts.sh -t "Hola" -o hola.mp3 --lang es
#   cf-tts.sh -t "Bold read" -o vo.mp3 --model @cf/deepgram/aura-1 --speaker angus
#
# Models (default aura-1 — verified working 2026-07-12):
#   @cf/deepgram/aura-1      input {text, speaker}   -> streams raw MPEG audio bytes  [WORKS]
#   @cf/deepgram/aura-2-en   input {text, speaker}   -> streams raw MPEG audio bytes  [WORKS]
#   @cf/myshell-ai/melotts   input {prompt, lang}    -> JSON {result:{audio:<base64>}} [500 server-side, see SKILL.md]
# MeloTTS is cheaper on paper ($0.0002/audio-min) but returned Internal server error
# (code 3043) on every call as of 2026-07-12; default to aura-1 until it recovers.
set -euo pipefail

MODEL="@cf/deepgram/aura-1"
TEXT=""
OUT=""
LANG="en"
SPEAKER=""

die() { echo "cf-tts: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -t|--text)    TEXT="${2:-}";    shift 2 ;;
    -o|--out)     OUT="${2:-}";     shift 2 ;;
    -m|--model)   MODEL="${2:-}";   shift 2 ;;
    -l|--lang)    LANG="${2:-}";    shift 2 ;;
    -s|--speaker) SPEAKER="${2:-}"; shift 2 ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

[ -n "$TEXT" ] || die "missing --text"
[ -n "$OUT" ]  || die "missing --out"
ACCOUNT_ID="${CF_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "CLOUDFLARE_API_TOKEN not set in env"
[ -n "$ACCOUNT_ID" ] || die "CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) not set in env"

# MeloTTS uses {prompt, lang}; Deepgram Aura uses {text, speaker}.
body=$(MODEL="$MODEL" TEXT="$TEXT" LANG="$LANG" SPEAKER="$SPEAKER" python3 - <<'PY'
import json, os
model = os.environ["MODEL"]
text  = os.environ["TEXT"]
if "melotts" in model:
    b = {"prompt": text, "lang": os.environ.get("LANG") or "en"}
else:  # deepgram aura family
    b = {"text": text}
    sp = os.environ.get("SPEAKER") or ""
    if sp:
        b["speaker"] = sp
print(json.dumps(b))
PY
)

url="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}"
raw="$(mktemp)"
trap 'rm -f "$raw"' EXIT

code=$(curl -sS -o "$raw" -w '%{http_code}' \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST --data "$body" "$url")

if [ "$code" != "200" ]; then
  echo "cf-tts: HTTP $code from Workers AI" >&2
  head -c 800 "$raw" >&2; echo >&2
  exit 1
fi

# MeloTTS returns JSON {result:{audio:<base64>}}; Aura streams raw audio bytes.
first=$(head -c 1 "$raw")
if [ "$first" = "{" ]; then
  python3 - "$raw" "$OUT" <<'PY'
import base64, json, sys
raw, out = sys.argv[1], sys.argv[2]
d = json.load(open(raw))
aud = (d.get("result") or {}).get("audio") or d.get("audio")
if not aud:
    sys.stderr.write("cf-tts: no audio field in JSON response: %s\n" % json.dumps(d)[:400])
    sys.exit(1)
open(out, "wb").write(base64.b64decode(aud))
PY
else
  cp "$raw" "$OUT"
fi

bytes=$(wc -c < "$OUT" | tr -d ' ')
echo "cf-tts: wrote $OUT ($bytes bytes) via $MODEL"
