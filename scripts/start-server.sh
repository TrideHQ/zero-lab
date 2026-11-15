#!/usr/bin/env bash
# Starts the production server with the LLM settings from a private env file (never committed).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ZERO_LAB_ENV:-/root/.config/alo/llm.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
export PARTNER_STORE="${PARTNER_STORE:-$(dirname "$ENV_FILE")/partner-phrases.json}"
exec node server/index.ts
