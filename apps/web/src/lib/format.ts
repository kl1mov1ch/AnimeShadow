import type { AnimeSummary } from "@animeshadow/shared";

export function scoreLabel(score: number | null): string {
  return score == null ? "—" : score.toFixed(2);
}

/** Best display title without locale context (fallbacks). Prefer `useLabels().title`. */
export function displayTitle(
  anime: Pick<AnimeSummary, "title" | "titleEnglish"> & {
    titleLocalized?: string | null;
  },
): string {
  return anime.titleLocalized?.trim() || anime.titleEnglish?.trim() || anime.title;
}

/** Canonical route for an anime detail page (id carries meaning, slug is cosmetic). */
export function animeHref(anime: { id: number; slug: string }): string {
  return `/anime/${anime.slug || anime.id}`;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const PROXY_HOSTS =
  /(^|\.)(shikimori\.(io|one|org|me)|kp\.yandex\.net|mds\.yandex\.net|nekos\.best)$/i;

/**
 * Shikimori, Kinopoisk and nekos.best all block hot-linking (Referer check /
 * Cloudflare bot rule), so route those images through the API's `/api/img`
 * proxy. Everything else is returned untouched.
 */
export function imageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    if (PROXY_HOSTS.test(parsed.hostname)) {
      return `${API_BASE}/api/img?u=${encodeURIComponent(parsed.toString())}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Routes a theme's audio through our own proxy.
 *
 * Not for hot-linking reasons — the archive allows that — but for CORS. Its
 * audio host sends no Access-Control-Allow-Origin, and a <audio> element read
 * by Web Audio without it produces a tainted stream: the analyser sees
 * silence and the sound itself stops. The proxy adds the header (and forwards
 * range requests, so seeking still works).
 */
export function audioSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return `${API_BASE}/api/audio?u=${encodeURIComponent(url)}`;
}
