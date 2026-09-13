/** The bot created via @BotFather — public knowledge (it's the handle shown
 * on the login button itself), so this lives in source, not an env var. */
export const TELEGRAM_BOT_USERNAME = "animeshadow_bot";

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
