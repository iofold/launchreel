#!/usr/bin/env bash
# LaunchReel renderer — thin machine-callable wrapper over scripts/render.ts.
#
# Usage:
#   scripts/render.sh --storyboard <json> --assets <dir> --out <dir> [extra render.ts flags]
#
# Emits a JSON summary on stdout (last line) and progress on stderr.
# Non-interactive; safe to call from agent/worker.py.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --import tsx scripts/render.ts "$@"
