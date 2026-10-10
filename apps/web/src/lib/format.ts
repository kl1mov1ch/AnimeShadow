import { genreSlug } from "@animeshadow/shared";
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

/** A genre's own page ("/genre/romance"), or the catalogue when it has no address. */
export function genreHref(name: string): string {
  const slug = genreSlug(name);
  return slug ? `/genre/${slug}` : `/browse?q=${encodeURIComponent(name)}`;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const PROXY_HOSTS =
  /(^|\.)(shikimori\.(io|one|org|me)|kp\.yandex\.net|mds\.yandex\.net|nekos\.best|anilist\.co|myanimelist\.net|kitsu\.(app|io))$/i;

/**
 * Pictures from the catalogues we draw on come through our own `/api/img`,
 * which fetches each one once and keeps it on disk. Shikimori, Kinopoisk and
 * nekos.best block hot-linking outright; AniList's, MyAnimeList's and
 * Kitsu's CDNs are slow or patchy from Russia, which left posters and
 * banners blank for a lot of visitors. From our own origin they arrive
 * quickly and the same way for everyone. Anything else passes untouched.
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
 * The full-size version of a card-sized AniList cover.
 *
 * Grids store and load AniList's 230px cover, because its 460px one is up to
 * ~500KB and twenty of them is a disaster on a phone. A title page shows
 * exactly one poster, though, at a size where 230px looks soft — so that one
 * image is upgraded here. AniList serves the same file at both paths. Anything
 * that is not an AniList cover passes through untouched.
 */
export function fullSizeCover(url: string | null | undefined): string | null | undefined {
  if (!url || !url.includes("anilist.co")) return url;
  return url.replace("/media/anime/cover/medium/", "/media/anime/cover/large/");
}
