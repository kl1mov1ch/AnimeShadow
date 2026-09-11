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

echo "==> apt update/upgrade"
apt-get update -y
apt-get upgrade -y

echo "==> base packages"
apt-get install -y curl git ca-certificates gnupg ufw postgresql postgresql-contrib openssl

echo "==> firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> node 20 + pnpm"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
corepack enable
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

echo "==> app dir + clone"
mkdir -p "$APP_DIR"
chown "$APP_USER":"$APP_USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone "$REPO_SSH" "$APP_DIR"
fi

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
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm install --frozen-lockfile"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm db:generate"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm build"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm --filter @animeshadow/db migrate:deploy"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm db:seed"

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
