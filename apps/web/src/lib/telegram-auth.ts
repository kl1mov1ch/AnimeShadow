/** The bot created via @BotFather — public knowledge (it's derivable from any
 * link to the bot), so this lives in source, not an env var. The numeric id
 * is just the digits before the ":" in the bot token. */
const TELEGRAM_BOT_ID = "8597754490";

/**
 * Telegram's Login Widget only ever renders as a cross-origin iframe with a
 * fixed blue "Log in with Telegram" button — there's no supported way to
 * restyle it. Telegram also documents a plain redirect flow for exactly this
 * case: send the user to oauth.telegram.org/auth, they confirm there, and
 * Telegram redirects back to `return_to` with the signed result attached.
 * That means the on-page button can be perfectly ordinary HTML, styled to
 * match the rest of the site.
 *
 * Either way, Telegram only ever completes this on the exact domain
 * registered for the bot via @BotFather's /setdomain — localhost/127.0.0.1/
 * bare IPs can never legitimately be that domain, so those are skipped
 * outright rather than sending the user off to a redirect that's guaranteed
 * to land on Telegram's own error page.
 */
export function isTelegramLoginSupported(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    return false;
  }
  return !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/** Where clicking the button sends the browser. `return_to` strips any
 * previous auth result so a page reload never replays it. */
export function buildTelegramAuthUrl(): string {
  const returnTo = new URL(window.location.href);
  returnTo.hash = "";
  returnTo.searchParams.delete("tgAuthResult");

  const params = new URLSearchParams({
    bot_id: TELEGRAM_BOT_ID,
    origin: window.location.origin,
    request_access: "write",
    return_to: returnTo.toString(),
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

/** What Telegram hands back once someone actually authorises — passed
 * straight through to POST /auth/telegram, which verifies `hash`
 * server-side before trusting any of it. */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function decodeTgAuthResult(raw: string): TelegramAuthData | null {
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      data &&
      typeof data === "object" &&
      typeof (data as TelegramAuthData).id === "number" &&
      typeof (data as TelegramAuthData).hash === "string"
    ) {
      return data as TelegramAuthData;
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads the `tgAuthResult` Telegram appends to `return_to` after the user
 * confirms — it lands in either the hash or the query string depending on
 * how they complete the flow, so both are checked. Also cleans it out of the
 * URL so it can't be re-parsed on a later reload/back-navigation. */
export function consumeTelegramAuthResult(): TelegramAuthData | null {
  if (typeof window === "undefined") return null;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  const raw = hashParams.get("tgAuthResult") ?? searchParams.get("tgAuthResult");
  if (!raw) return null;

  const cleanUrl = new URL(window.location.href);
  cleanUrl.hash = "";
  cleanUrl.searchParams.delete("tgAuthResult");
  window.history.replaceState(null, "", cleanUrl.toString());

  return decodeTgAuthResult(raw);
}
