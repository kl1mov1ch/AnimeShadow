#!/usr/bin/env bash
# Re-deploy: pull latest main, rebuild, apply migrations, restart the API.
# Run as root: bash /var/www/animeshadow/deploy/deploy.sh
#
# Built to finish on a small VM. The old version ran `pnpm build` — every
# package in parallel, then `tsc --noEmit` over the whole web app before
# `vite build` — which on a 1–2 GB machine ran out of memory at the web
# step and sat there swapping (or with no swap, simply stalled). Now:
#   * a 2 GB swapfile is created once if the machine has no swap at all;
#   * packages build one at a time;
#   * the web app is built with `vite build` alone — the type check already
#     runs before every commit, repeating it here only costs memory;
#   * Node gets an explicit heap cap so it fails loudly instead of hanging.
set -euo pipefail

APP_DIR="/var/www/animeshadow"
APP_USER="kl1mov1ch.exe"
NODE_HEAP_MB="${NODE_HEAP_MB:-1536}"
AS_APP_USER="sudo -u $APP_USER COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB bash -lc"

step() { echo; echo "==> $1  [$(date +%H:%M:%S), +${SECONDS}s]"; }

step "memory"
free -m | sed -n '1,3p'
if [ -z "$(swapon --show --noheadings 2>/dev/null)" ]; then
  if [ ! -f /swapfile ]; then
    echo "no swap — creating a 2G /swapfile (one time)"
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  swapon /swapfile || true
  free -m | sed -n '3p'
fi

step "git pull"
BEFORE="$(cd "$APP_DIR" && git rev-parse --short HEAD)"
$AS_APP_USER "cd '$APP_DIR' && git pull --ff-only"
AFTER="$(cd "$APP_DIR" && git rev-parse --short HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "!! no new commits ($AFTER) — did you run 'git push origin main' first?"
  echo "   rebuilding the current version anyway"
else
  echo "$BEFORE -> $AFTER"
fi

step "install deps"
$AS_APP_USER "cd '$APP_DIR' && pnpm install --frozen-lockfile"

step "prisma generate"
$AS_APP_USER "cd '$APP_DIR' && pnpm db:generate"

step "build packages (one at a time)"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter './packages/*' -r --workspace-concurrency=1 build"

step "build api"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/api build"

step "build web"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/web exec vite build"

step "apply migrations"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/db migrate:deploy"

step "sync systemd unit + restart api"
cp "$APP_DIR/deploy/animeshadow-api.service" /etc/systemd/system/animeshadow-api.service
systemctl daemon-reload
systemctl restart animeshadow-api

step "sync caddy config + reload"
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

step "health"
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health; then
    echo "api is up"
    break
  fi
  [ "$i" = 20 ] && { echo "!! api did not come up — journalctl -u animeshadow-api -n 80"; exit 1; }
  sleep 2
done

echo
echo "Deployed $AFTER in ${SECONDS}s"
