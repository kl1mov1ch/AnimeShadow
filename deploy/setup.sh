#!/usr/bin/env bash
# One-time VPS provisioning for AnimeShadow on Ubuntu 24.04.
# Run once, as root: bash setup.sh
#
# Idempotent where practical (safe to re-run), but this is a first-boot
# script, not the redeploy path — use deploy/deploy.sh for updates.
set -euo pipefail

DOMAIN="fiat-legacy.xyz"
APP_USER="kl1mov1ch.exe"
APP_DIR="/var/www/animeshadow"
REPO_SSH="git@github.com:kl1mov1ch/AnimeShadow.git"

export DEBIAN_FRONTEND=noninteractive

echo "==> apt update"
apt-get update -y

echo "==> base packages"
apt-get install -y curl git ca-certificates gnupg ufw postgresql postgresql-contrib

echo "==> firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> node 22 + pnpm"
# pnpm 11 itself requires Node >=22.13 to run (the app only needs >=20.11,
# but the pnpm CLI is the stricter constraint here).
NODE_MAJOR="$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack prepare pnpm@11.3.0 --activate

echo "==> caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> postgres role + db"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24)}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'animeshadow') THEN
    CREATE ROLE animeshadow LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE animeshadow WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'animeshadow'" | grep -q 1 || \
  sudo -u postgres createdb -O animeshadow animeshadow

echo "==> app user"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

echo "==> app dir + clone"
mkdir -p "$APP_DIR"
git config --system --add safe.directory "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  if [ -n "${GH_TOKEN:-}" ]; then
    git clone "https://${GH_TOKEN}@github.com/kl1mov1ch/AnimeShadow.git" "$APP_DIR"
    git -C "$APP_DIR" remote set-url origin "https://github.com/kl1mov1ch/AnimeShadow.git"
  else
    git clone "$REPO_SSH" "$APP_DIR"
  fi
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "==> .env"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="postgresql://animeshadow:${DB_PASSWORD}@localhost:5432/animeshadow?schema=public"
API_HOST=127.0.0.1
API_PORT=4000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://${DOMAIN}
SHIKIMORI_BASE_URL=https://shikimori.io
TRANSLATE_ENABLED=true
PRO_FOR_ALL=true
VITE_API_URL=
ENV
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo "==> build"
cd "$APP_DIR"
AS_APP_USER="sudo -u $APP_USER COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -lc"
$AS_APP_USER "cd '$APP_DIR' && pnpm install --frozen-lockfile"
$AS_APP_USER "cd '$APP_DIR' && pnpm db:generate"
$AS_APP_USER "cd '$APP_DIR' && pnpm build"
$AS_APP_USER "cd '$APP_DIR' && pnpm --filter @animeshadow/db migrate:deploy"
$AS_APP_USER "cd '$APP_DIR' && pnpm db:seed"

echo "==> systemd service"
cp "$APP_DIR/deploy/animeshadow-api.service" /etc/systemd/system/animeshadow-api.service
systemctl daemon-reload
systemctl enable --now animeshadow-api

echo "==> caddy config"
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo
echo "Done."
echo "DB password and JWT secret were generated and written to $APP_DIR/.env (mode 600)."
echo "Site: https://${DOMAIN}"
