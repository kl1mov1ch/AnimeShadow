/** The bot created via @BotFather — public knowledge (it's the handle shown
 * on the login button itself), so this lives in source, not an env var. */
export const TELEGRAM_BOT_USERNAME = "animeshadow_bot";

/**
 * Telegram only ever renders its Login Widget on the exact domain set for
 * the bot via @BotFather's /setdomain — anywhere else it just writes a
 * plain "Bot domain invalid" box into the page, with no error callback to
 * react to and hide it afterwards. localhost/127.0.0.1/bare IPs can never
 * legitimately be that domain, so those are skipped outright rather than
 * shown broken; anything else is assumed to be the configured production
 * domain (there's no way to actually confirm that from the browser).
 */
export function isTelegramWidgetSupported(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    return false;
  }
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/** What the Telegram Login Widget hands back once someone actually
 * authorises — passed straight through to POST /auth/telegram, which
 * verifies `hash` server-side before trusting any of it. */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthData) => void;
  }
}
