/** The site's Telegram channel. */
export const TELEGRAM_CHANNEL = "https://t.me/shadowani";

/** The site's TikTok. */
export const TIKTOK_URL = "https://www.tiktok.com/@anime_shadow_online";

/** The channel's invite link — the one to pass on to friends. */
export const TELEGRAM_INVITE = "https://t.me/+GS8YSkXLD6RjMjEy";

/**
 * Passes the invite on: the phone's own share sheet where there is one,
 * the clipboard otherwise. Resolves to what happened, for the caller's toast.
 */
export async function shareInvite(): Promise<"shared" | "copied" | "failed"> {
  const data = {
    title: "AnimeShadow в Telegram",
    text: "Залетай в канал AnimeShadow — новые серии, подборки и обновления сайта:",
    url: TELEGRAM_INVITE,
  };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.(data) !== false) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      // Closing the share sheet is not a failure, and not a reason to copy.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(TELEGRAM_INVITE);
    return "copied";
  } catch {
    return "failed";
  }
}
