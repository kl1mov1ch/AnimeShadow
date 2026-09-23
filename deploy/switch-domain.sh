#!/usr/bin/env bash
# Point the running site at a new domain, then rebuild and restart it.
#
#   sudo bash /var/www/animeshadow/deploy/switch-domain.sh
#   sudo bash /var/www/animeshadow/deploy/switch-domain.sh example.com --with-email
#
# Everything the domain appears in *inside the repo* is already committed —
# the Caddy site block, robots.txt, the User-Agent this project introduces
# itself with. What lives outside the repo is the server's own .env, and
# that is what this script rewrites: CORS_ORIGINS (whose first entry is also
# the base URL of the sitemap), APP_URL (the one-click links inside emails)
# and VITE_SITE_URL (canonical links and share cards, baked in at build
# time — which is why the .env has to be right *before* the rebuild, not
# after).
#
# Then it hands over to deploy.sh, which pulls, rebuilds the front end with
# the new VITE_SITE_URL, applies migrations, restarts the API, installs the
# new Caddyfile and reloads Caddy.
#
# Flags:
#   --with-email   also move EMAIL_FROM to the new domain. Off by default:
#                  until the domain is verified in Resend, sending from it
#                  fails, which would break registration confirmations.
#   --no-deploy    only rewrite the .env, do not rebuild.
#   --dry-run      print what would change and touch nothing.
set -euo pipefail

DOMAIN="animeshadow.online"
APP_DIR="${APP_DIR:-/var/www/animeshadow}"
WITH_EMAIL=0
DEPLOY=1
DRY_RUN=0

for arg in "$@"; do
	case "$arg" in
	--with-email) WITH_EMAIL=1 ;;
	--no-deploy) DEPLOY=0 ;;
	--dry-run) DRY_RUN=1 ;;
	-h | --help)
		sed -n '2,27p' "$0"
		exit 0
		;;
	-*)
		echo "unknown flag: $arg" >&2
		exit 1
		;;
	*) DOMAIN="$arg" ;;
	esac
done

ENV_FILE="$APP_DIR/.env"
ORIGIN="https://${DOMAIN}"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "no .env at $ENV_FILE — is APP_DIR right?" >&2
	exit 1
fi
# Only the deploy step needs root — it writes /etc/caddy and talks to
# systemd. Rewriting the .env alone is something the app user can do.
if [[ $DRY_RUN -eq 0 && $DEPLOY -eq 1 && $EUID -ne 0 ]]; then
	echo "run me as root: the deploy step writes /etc/caddy and talks to systemd" >&2
	exit 1
fi

# The domain has to resolve before Caddy can be issued a certificate for it.
# A failure here is not fatal — the box may have no dig, or DNS may be
# mid-propagation — but it is worth saying out loud before a rebuild.
if command -v dig >/dev/null 2>&1; then
	resolved="$(dig +short "$DOMAIN" A | tail -1)"
	if [[ -z "$resolved" ]]; then
		echo "!! $DOMAIN does not resolve yet — Caddy will not get a certificate."
		echo "   Continuing anyway; re-run 'systemctl reload caddy' once DNS lands."
	else
		echo "==> $DOMAIN resolves to $resolved"
	fi
fi

# Rewrite one KEY=value in place, appending it if it was never there.
# Written through the original file so the inode, owner and 0600 mode
# survive — the .env holds the database password and the JWT secret.
set_var() {
	local key="$1" value="$2" tmp
	local current
	current="$(awk -v k="$key" 'index($0, k "=") == 1 { sub("^" k "=", ""); print; exit }' "$ENV_FILE")"

	if [[ "$current" == "$value" ]]; then
		printf '    %-14s already %s\n' "$key" "$value"
		return
	fi
	printf '    %-14s %s -> %s\n' "$key" "${current:-<unset>}" "$value"
	[[ $DRY_RUN -eq 1 ]] && return

	tmp="$(mktemp)"
	KEY="$key" VALUE="$value" awk '
		BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; seen = 0 }
		index($0, key "=") == 1 { if (!seen) print key "=" value; seen = 1; next }
		{ print }
		END { if (!seen) print key "=" value }
	' "$ENV_FILE" >"$tmp"
	cat "$tmp" >"$ENV_FILE"
	rm -f "$tmp"
}

echo "==> .env ($ENV_FILE)"
if [[ $DRY_RUN -eq 0 ]]; then
	BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
	cp -a "$ENV_FILE" "$BACKUP"
	echo "    backup: $BACKUP"
fi

set_var CORS_ORIGINS "$ORIGIN"
set_var APP_URL "$ORIGIN"
set_var VITE_SITE_URL "$ORIGIN"
if [[ $WITH_EMAIL -eq 1 ]]; then
	set_var EMAIL_FROM "AnimeShadow <noreply@${DOMAIN}>"
fi

# VITE_API_URL must stay empty: the front end then calls whatever origin it
# was served from, which is what makes it domain-agnostic in the first place.
api_url="$(awk 'index($0, "VITE_API_URL=") == 1 { sub("^VITE_API_URL=", ""); print; exit }' "$ENV_FILE")"
if [[ -n "$api_url" ]]; then
	echo "!! VITE_API_URL is set to '$api_url' — clear it unless the API is on another host."
fi

if [[ $DRY_RUN -eq 1 ]]; then
	echo "==> dry run, nothing written"
	exit 0
fi

if [[ $DEPLOY -eq 0 ]]; then
	echo "==> .env updated; skipping the rebuild (--no-deploy)"
	exit 0
fi

echo "==> deploy"
bash "$APP_DIR/deploy/deploy.sh"

echo "==> checks"
printf '    apex      %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$ORIGIN/" || echo failed)"
printf '    www       %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://www.${DOMAIN}/" || echo failed)"
printf '    api       %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$ORIGIN/api/health" || echo failed)"

cat <<NEXT

Done. Two things no script can do for you:

  1. @BotFather -> /setdomain -> $DOMAIN
     The Telegram login widget is pinned to a domain and fails silently
     on the wrong one.
  2. Verify $DOMAIN in Resend, then re-run this with --with-email.

Everyone is signed out: the session lives in localStorage, which belongs
to the old origin. The accounts themselves are untouched.
NEXT
