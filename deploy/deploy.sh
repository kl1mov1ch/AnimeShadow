#!/usr/bin/env bash
# Re-deploy: pull latest main, rebuild, apply migrations, restart the API.
# Run as root: bash /var/www/animeshadow/deploy/deploy.sh
set -euo pipefail

APP_DIR="/var/www/animeshadow"
APP_USER="kl1mov1ch.exe"
AS_APP_USER="sudo -u $APP_USER COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -lc"

echo "==> git pull"
$AS_APP_USER "cd '$APP_DIR' && git pull --ff-only"

echo "==> install deps"
$AS_APP_USER "cd '$APP_DIR' && pnpm install --frozen-lockfile"

echo "==> prisma generate"
$AS_APP_USER "cd '$APP_DIR' && pnpm db:generate"

echo "==> build"
$AS_APP_USER "cd '$APP_DIR' && pnpm build"

echo "==> apply migrations"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/db migrate:deploy"

echo "==> restart api"
systemctl restart animeshadow-api

echo "==> reload caddy"
systemctl reload caddy

echo "Deployed $(cd "$APP_DIR" && git rev-parse --short HEAD)"
