#!/usr/bin/env bash
# Prometheus on the production host itself, as a systemd service — no Docker.
#
# Why not the container in docker-compose.yml: in production the API listens
# on 127.0.0.1 only (API_HOST in .env), which a container can't reach through
# host.docker.internal; the token file was written mode 600 and the
# container's user couldn't read it; and nothing ever started the container.
# Here Prometheus runs next to the API and scrapes 127.0.0.1:4000 directly.
#
# Idempotent: the first run downloads and installs Prometheus; every run
# rewrites the config and the scrape token from .env and restarts it.
# Run as root (deploy.sh calls it): bash deploy/prometheus/install-host.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/animeshadow}"
VERSION="${PROMETHEUS_VERSION:-3.5.0}"
PREFIX="/opt/prometheus"
CONF_DIR="/etc/animeshadow-prometheus"
DATA_DIR="/var/lib/animeshadow-prometheus"
UNIT="/etc/systemd/system/animeshadow-prometheus.service"

case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "!! unsupported architecture $(uname -m)"; exit 1 ;;
esac

# A container from the old setup would hold port 9090.
if command -v docker >/dev/null 2>&1; then
  docker rm -f animeshadow-prometheus >/dev/null 2>&1 || true
fi

id prometheus >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin prometheus

if [ ! -x "$PREFIX/prometheus" ] || ! "$PREFIX/prometheus" --version 2>/dev/null | grep -q "version $VERSION"; then
  echo "installing Prometheus $VERSION ($ARCH)"
  tmp="$(mktemp -d)"
  name="prometheus-$VERSION.linux-$ARCH"
  base="https://github.com/prometheus/prometheus/releases/download/v$VERSION"
  curl -fsSL -o "$tmp/$name.tar.gz" "$base/$name.tar.gz"
  curl -fsSL -o "$tmp/sha256sums.txt" "$base/sha256sums.txt"
  (cd "$tmp" && grep " $name.tar.gz\$" sha256sums.txt | sha256sum -c -)
  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  mkdir -p "$PREFIX"
  install -m 755 "$tmp/$name/prometheus" "$tmp/$name/promtool" "$PREFIX/"
  rm -rf "$tmp"
fi

mkdir -p "$CONF_DIR" "$DATA_DIR"
chown prometheus:prometheus "$DATA_DIR"

# The scrape token: METRICS_TOKEN from the app's .env, readable by
# Prometheus and nobody else.
token="$(grep -E '^METRICS_TOKEN=' "$APP_DIR/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
printf '%s' "$token" > "$CONF_DIR/metrics-token"
chown root:prometheus "$CONF_DIR/metrics-token"
chmod 640 "$CONF_DIR/metrics-token"
[ -z "$token" ] && echo "(METRICS_TOKEN is empty in .env — /metrics is open, scraping without a token)"

api_port="$(grep -E '^API_PORT=' "$APP_DIR/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
api_port="${api_port:-4000}"

cat > "$CONF_DIR/prometheus.yml" <<YML
# Written by deploy/prometheus/install-host.sh — edits here are overwritten.
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: animeshadow-api
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: $CONF_DIR/metrics-token
    static_configs:
      - targets: ["127.0.0.1:$api_port"]
YML
"$PREFIX/promtool" check config "$CONF_DIR/prometheus.yml" >/dev/null

cat > "$UNIT" <<UNIT
[Unit]
Description=Prometheus for AnimeShadow
After=network-online.target

[Service]
User=prometheus
Group=prometheus
ExecStart=$PREFIX/prometheus \\
  --config.file=$CONF_DIR/prometheus.yml \\
  --storage.tsdb.path=$DATA_DIR \\
  --storage.tsdb.retention.time=30d \\
  --web.listen-address=127.0.0.1:9090
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable animeshadow-prometheus >/dev/null 2>&1
systemctl restart animeshadow-prometheus

for i in $(seq 1 15); do
  if curl -fsS -o /dev/null http://127.0.0.1:9090/-/ready; then
    echo "prometheus is up on 127.0.0.1:9090"
    exit 0
  fi
  sleep 2
done
echo "!! prometheus did not become ready — journalctl -u animeshadow-prometheus -n 60"
exit 1
