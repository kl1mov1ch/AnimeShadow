#!/usr/bin/env bash
# Re-deploy: pull latest main, rebuild, apply migrations, restart the API.
# Run from anywhere: bash /var/www/animeshadow/deploy/deploy.sh
set -euo pipefail
cd /var/www/animeshadow

echo "==> git pull"
git pull --ff-only

echo "==> install deps"
pnpm install --frozen-lockfile

echo "==> prisma generate"
pnpm db:generate

echo "==> build"
pnpm build

echo "==> apply migrations"
pnpm --filter @animeshadow/db migrate:deploy

echo "==> restart api"
sudo systemctl restart animeshadow-api

echo "==> reload caddy"
sudo systemctl reload caddy

echo "Deployed $(git rev-parse --short HEAD)"
