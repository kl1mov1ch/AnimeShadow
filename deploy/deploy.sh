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

# Postgres is the first thing the kernel's OOM killer picks when a build
# runs the machine out of memory, and nothing restarted it — so the next
# deploy built fine and then died at the migrations with "can't reach
# database server". Make sure it's up (and comes back on boot) first.
step "postgres"
systemctl enable postgresql >/dev/null 2>&1 || true
if ! pg_isready -h localhost -p 5432 -q; then
  echo "postgres is down — starting it"
  systemctl start postgresql
  # Debian/Ubuntu: the real service is the cluster unit behind the wrapper.
  command -v pg_lsclusters >/dev/null && pg_lsclusters --no-header | while read -r ver name _; do
    systemctl start "postgresql@${ver}-${name}" || true
  done
fi
for i in $(seq 1 15); do
  pg_isready -h localhost -p 5432 -q && { echo "postgres is ready"; break; }
  [ "$i" = 15 ] && { echo "!! postgres did not start — journalctl -u 'postgresql*' -n 80"; exit 1; }
  sleep 2
done

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

# Migrations before anything is built: if the database can't take them,
# nothing has changed yet and the live site is still whole.
step "apply migrations"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/db migrate:deploy"

step "build packages (one at a time)"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter './packages/*' -r --workspace-concurrency=1 build"

step "build api"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/api build"

# The web app is built next to the live one, not over it. Building straight
# into dist once put a new front end in front of an old API (a later step
# failed before the API restarted): every new endpoint 404'd and the admin
# page crashed. It's swapped in only after the new API answers.
WEB="$APP_DIR/apps/web"
step "build web (into dist-next)"
$AS_APP_USER "cd '$APP_DIR' && rm -rf '$WEB/dist-next' && pnpm --filter @animeshadow/web exec vite build --outDir dist-next --emptyOutDir"

# Compressed once here, served as-is by Caddy (file_server precompressed),
# instead of Caddy compressing the same files again on every request.
step "precompress web assets"
find "$WEB/dist-next" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' -o -name '*.webmanifest' \) \
  -size +1k -exec gzip -k -9 -f {} +
if command -v brotli >/dev/null; then
  find "$WEB/dist-next" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' -o -name '*.webmanifest' \) \
    -size +1k -exec brotli -k -f -q 11 {} +
else
  echo "(brotli not installed — gzip only; 'apt install brotli' for smaller files)"
fi
chown -R "$APP_USER" "$WEB/dist-next"

step "sync systemd unit + restart api"
cp "$APP_DIR/deploy/animeshadow-api.service" /etc/systemd/system/animeshadow-api.service
systemctl daemon-reload
systemctl restart animeshadow-api

step "health"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health; then
    echo "api is up"
    break
  fi
  if [ "$i" = 30 ]; then
    echo "!! api did not come up — the old web app stays live."
    echo "   journalctl -u animeshadow-api -n 80"
    exit 1
  fi
  sleep 2
done

step "swap in the new web app"
rm -rf "$WEB/dist-prev"
[ -d "$WEB/dist" ] && mv "$WEB/dist" "$WEB/dist-prev"
mv "$WEB/dist-next" "$WEB/dist"
echo "previous build kept in apps/web/dist-prev"

step "sync caddy config + reload"
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

echo
echo "Deployed $AFTER in ${SECONDS}s"
