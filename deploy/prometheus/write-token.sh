#!/usr/bin/env sh
# Copies METRICS_TOKEN from the project .env into the file Prometheus reads,
# so the secret lives in one place. Run from the repo root before
# `docker compose up -d prometheus`, and again whenever the token changes.
set -eu
ENV_FILE="${1:-.env}"
OUT="deploy/prometheus/metrics-token"
token="$(grep -E '^METRICS_TOKEN=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
printf '%s' "$token" > "$OUT"
chmod 600 "$OUT" 2>/dev/null || true
echo "wrote $OUT (${#token} chars)"
