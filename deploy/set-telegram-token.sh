#!/usr/bin/env bash
# Puts a new Telegram bot token into the server's .env and restarts the API.
#
#   cd /var/www/animeshadow && bash deploy/set-telegram-token.sh
#
# The token is asked for (not typed on the command line, so it stays out of
# the shell history), checked with Telegram first (getMe), written over the
# old one, and the API restarted; then the log is read for the bot starting.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/animeshadow}"
ENV_FILE="$APP_DIR/.env"
SERVICE="${SERVICE:-animeshadow-api}"

[ -f "$ENV_FILE" ] || { echo "!! $ENV_FILE not found"; exit 1; }

read -rsp "Новый токен бота (от @BotFather): " TOKEN
echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if ! [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]]; then
  echo "!! Не похоже на токен (нужно вида 123456789:AA...). Ничего не изменено."
  exit 1
fi

# The Bot API's address: api.telegram.org, unless .env points elsewhere (TELEGRAM_API_URL).
API="$(grep -E '^[[:space:]]*TELEGRAM_API_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'[:space:]' || true)"
API="${API:-https://api.telegram.org}"
API="${API%/}"

echo "Проверяю связь с Telegram ($API)…"
if ! curl -sS -o /dev/null --max-time 10 "$API"; then
  host="${API#*://}"
  host="${host%%[/:]*}"
  echo "!! Сервер не может соединиться с $host. Токен тут ни при чём — ничего не изменено."
  echo "   DNS:  $(getent hosts "$host" | head -n2 | tr '\n' ' ' || echo 'не резолвится')"
  printf '   IPv4: '; curl -4 -sS -o /dev/null -w '%{http_code}\n' --max-time 10 "$API" 2>&1 || true
  printf '   IPv6: '; curl -6 -sS -o /dev/null -w '%{http_code}\n' --max-time 10 "$API" 2>&1 || true
  echo "   Если IPv4 тоже не отвечает — хостинг блокирует Telegram. Варианты:"
  echo "     • попросить хостера открыть api.telegram.org (149.154.160.0/20, 91.108.4.0/22);"
  echo "     • свой обратный прокси Bot API за рубежом и TELEGRAM_API_URL=https://ваш-прокси в .env."
  exit 1
fi

echo "Проверяю токен…"
ME="$(curl -sS --max-time 15 "$API/bot$TOKEN/getMe" || true)"
if ! printf '%s' "$ME" | grep -q '"ok":true'; then
  echo "!! Telegram не принял токен. Ничего не изменено."
  echo "   Ответ: ${ME:-нет ответа}"
  exit 1
fi
BOT="$(printf '%s' "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
echo "OK: бот @$BOT"

# A webhook left from somewhere else would keep the bot from reading its chats.
curl -fsS --max-time 15 "$API/bot$TOKEN/deleteWebhook" >/dev/null || true

OWNER="$(stat -c '%U:%G' "$ENV_FILE")"
MODE="$(stat -c '%a' "$ENV_FILE")"
cp -p "$ENV_FILE" "$ENV_FILE.bak"

# The token, and polling left on (empty = on in production).
TMP="$(mktemp)"
grep -v -E '^[[:space:]]*(TELEGRAM_BOT_TOKEN|TELEGRAM_BOT_POLLING)=' "$ENV_FILE" > "$TMP" || true
{
  echo "TELEGRAM_BOT_TOKEN=$TOKEN"
  echo "TELEGRAM_BOT_POLLING=true"
} >> "$TMP"
install -m "$MODE" -o "${OWNER%%:*}" -g "${OWNER##*:}" "$TMP" "$ENV_FILE"
rm -f "$TMP"
unset TOKEN ME
echo "Записано в $ENV_FILE (старая версия — $ENV_FILE.bak)"

echo "Перезапускаю $SERVICE…"
systemctl restart "$SERVICE"
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:4000/api/health 2>/dev/null && break
  sleep 2
done

sleep 3
echo "---- лог бота ----"
journalctl -u "$SERVICE" --since "-3 min" --no-pager | grep -i telegram | tail -n 10 || true
echo "------------------"
echo "Готово. В Telegram откройте @$BOT → «⚙️ Настройки» → «🧪 Проверка»."
echo "Если всё работает, копию со старым токеном можно удалить: rm $ENV_FILE.bak"
