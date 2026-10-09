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

step() { CURRENT_STEP="$1"; echo; echo "==> $1  [$(date +%H:%M:%S), +${SECONDS}s]"; }

# Say where it stopped. A step killed for memory used to end the script with
# no message at all, leaving the old site up and no hint why.
CURRENT_STEP="start"
trap 'code=$?; echo; echo "!! deploy FAILED at step \"$CURRENT_STEP\" (exit $code)"; [ "$code" = 137 ] && echo "   exit 137 = killed for memory: free -m; dmesg | tail"; echo "   the live site was not changed by the failing step"' ERR

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
ensure_postgres() {
  systemctl enable postgresql >/dev/null 2>&1 || true
  if ! pg_isready -h localhost -p 5432 -q -t 10; then
    echo "postgres is down — starting it"
    systemctl start postgresql
    # Debian/Ubuntu: the real service is the cluster unit behind the wrapper.
    command -v pg_lsclusters >/dev/null && pg_lsclusters --no-header | while read -r ver name _; do
      systemctl start "postgresql@${ver}-${name}" || true
    done
  fi
  for i in $(seq 1 30); do
    pg_isready -h localhost -p 5432 -q -t 5 && { echo "postgres is ready"; return 0; }
    [ "$i" = 30 ] && { echo "!! postgres did not start — journalctl -u 'postgresql*' -n 80"; exit 1; }
    sleep 2
  done
}

step "postgres"
ensure_postgres

step "git pull"
# A rollback by hand (git checkout <commit>) leaves the repo off the branch,
# and then `git pull` has nothing to pull into — every later deploy would
# quietly rebuild that old commit. Always deploy main.
BRANCH="$(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "repo was on '$BRANCH', not main — switching back to main"
  $AS_APP_USER "cd '$APP_DIR' && git checkout main"
fi
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

# Keep the running API's build: if the new one won't start, it goes back.
API_DIST="$APP_DIR/apps/api/dist"
rm -rf "$API_DIST-prev"
[ -d "$API_DIST" ] && cp -a "$API_DIST" "$API_DIST-prev"

step "build api"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/api build"

# The web app is built next to the live one, not over it. Building straight
# into dist once put a new front end in front of an old API (a later step
# failed before the API restarted): every new endpoint 404'd and the admin
# page crashed. It's swapped in only after the new API answers.
# The old Prometheus container (replaced by the host service below) only
# takes memory the web build needs.
if command -v docker >/dev/null 2>&1; then
  docker rm -f animeshadow-prometheus >/dev/null 2>&1 || true
fi

WEB="$APP_DIR/apps/web"
step "build web (into dist-next)"
$AS_APP_USER "cd '$APP_DIR' && rm -rf '$WEB/dist-next' && BUILD_SOURCEMAP=0 pnpm --filter @animeshadow/web exec vite build --outDir dist-next --emptyOutDir"

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

# The new API is tried out on a spare port first, while the live one keeps
# serving. On this 2 GB machine the first start right after the web build is
# slow — everything was pushed out of memory, and Node, Prisma and the rest
# have to come back off the disk: it once took 95 seconds, longer than the old
# 60-second health check waited, so a perfectly good API was rolled back
# twice. Here the slow, cold start happens beside the live site; the real
# restart afterwards loads the same, now warm, files in a few seconds.
step "postgres (again — builds are when it gets killed)"
ensure_postgres

step "try the new api on a spare port"
PRE_PORT=4001
PRE_ENV="$APP_DIR/.env.preflight"
PRE_LOG="/tmp/animeshadow-preflight.log"
# A copy of .env with only the port changed, readable by the app user alone.
install -m 600 -o "$APP_USER" /dev/null "$PRE_ENV"
grep -v -E '^[[:space:]]*API_PORT=' "$APP_DIR/.env" > "$PRE_ENV"
echo "API_PORT=$PRE_PORT" >> "$PRE_ENV"
install -m 644 -o "$APP_USER" /dev/null "$PRE_LOG"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/apps/api' && exec env NODE_ENV=production /usr/bin/node --env-file='$PRE_ENV' dist/server.js >> '$PRE_LOG' 2>&1" &
PRE_PID=$!
pre_ok=""
printf "waiting for it to answer (a cold start here can take a couple of minutes) "
for i in $(seq 1 100); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PRE_PORT/api/health" 2>/dev/null; then
    pre_ok=1
    break
  fi
  kill -0 "$PRE_PID" 2>/dev/null || break # it exited: no point waiting
  printf "."
  sleep 3
done
echo
kill "$PRE_PID" 2>/dev/null || true
wait "$PRE_PID" 2>/dev/null || true
rm -f "$PRE_ENV"
if [ -z "$pre_ok" ]; then
  echo "!! the new api did not start. Its log:"
  echo "------------------------------------------------------------"
  tail -n 60 "$PRE_LOG" || true
  echo "------------------------------------------------------------"
  echo "!! deploy stopped: the live site was not touched and still runs the old version."
  [ -d "$API_DIST-prev" ] && { rm -rf "$API_DIST" && mv "$API_DIST-prev" "$API_DIST"; }
  exit 1
fi
echo "the new api answers after ${SECONDS}s into the deploy — switching the live one over"

step "sync systemd unit + restart api"
cp "$APP_DIR/deploy/animeshadow-api.service" /etc/systemd/system/animeshadow-api.service
systemctl daemon-reload
systemctl restart animeshadow-api

step "health"
printf "waiting "
api_ok=""
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null; then
    api_ok=1
    break
  fi
  printf "."
  sleep 3
done
echo
if [ -n "$api_ok" ]; then
  echo "api is up"
else
  echo "!! the new api did not come up on the live port. Its log:"
  echo "------------------------------------------------------------"
  journalctl -u animeshadow-api -n 60 --no-pager || true
  echo "------------------------------------------------------------"
  if [ -d "$API_DIST-prev" ]; then
    echo "!! putting the previous api back so the site stays up"
    rm -rf "$API_DIST" && mv "$API_DIST-prev" "$API_DIST"
    systemctl restart animeshadow-api
    for i in $(seq 1 60); do
      curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null && { echo "previous api is up — the site works on the old version"; break; }
      sleep 3
    done
  fi
  echo "!! deploy stopped: the new version is NOT live. Send the log above."
  exit 1
fi

# Monitoring: Prometheus on this host, scraping the API we just restarted.
# Never fails the deploy — the site matters more than its graphs.
step "prometheus"
bash "$APP_DIR/deploy/prometheus/install-host.sh" || echo "!! prometheus setup failed — the site is unaffected; see above"

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
