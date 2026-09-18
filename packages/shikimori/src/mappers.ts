import {
  type AnimeAiring,
  type AnimeDetail,
  type AnimeSeason,
  type AnimeSummary,
  type AnimeType,
  type Character,
  type CharacterDetail,
  type FranchiseEntry,
  type Genre,
  slugify,
} from "@animeshadow/shared";
import { parseCharacterDescription, stripShikimoriMarkup } from "./markup.js";
import type {
  ShikiAnimeFull,
  ShikiAnimeShort,
  ShikiFranchise,
  ShikiGenre,
  ShikiMangaShort,
  ShikiRole,
  ShikiVideo,
} from "./types.js";

const SHIKIMORI_BASE = "https://shikimori.io";

export function mapKind(kind: string | null | undefined): AnimeType {
  switch ((kind ?? "").toLowerCase()) {
    case "tv":
    case "tv_special":
      return "TV";
    case "movie":
      return "MOVIE";
    case "ova":
      return "OVA";
    case "ona":
      return "ONA";
    case "special":
      return "SPECIAL";
    case "music":
    case "pv":
    case "cm":
      return "MUSIC";
    default:
      return "UNKNOWN";
  }
}

export function mapStatus(status: string | null | undefined): AnimeAiring {
  switch ((status ?? "").toLowerCase()) {
    case "released":
      return "FINISHED";
    case "ongoing":
      return "AIRING";
    case "anons":
      return "UPCOMING";
    default:
      return "UNKNOWN";
  }
}

function mapRating(rating: string | null | undefined): string | null {
  switch ((rating ?? "").toLowerCase()) {
    case "g":
      return "G";
    case "pg":
      return "PG";
    case "pg_13":
      return "PG-13";
    case "r":
      return "R - 17+";
    case "r_plus":
      return "R+";
    case "rx":
      return "Rx";
    default:
      return null;
  }
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = new Date(date).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

function seasonOf(date: string | null | undefined): AnimeSeason | null {
  if (!date) return null;
  const month = new Date(date).getUTCMonth();
  if (Number.isNaN(month)) return null;
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

function toIso(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function imageUrl(path: string | null | undefined): string | null {
  if (!path || path.includes("missing")) return null;
  // Strip Shikimori's cache-busting query (?1711947446) so the proxy caches cleanly.
  const clean = path.split("?")[0] ?? path;
  return clean.startsWith("http") ? clean : `${SHIKIMORI_BASE}${clean}`;
}

/**
 * Real poster from the API's `image` object. Shikimori returns a `missing_*`
 * sentinel for anime with no artwork (common for announced titles) — treat
 * that as "no image" so the UI can fall back to a styled title card instead
 * of rendering a broken <img>. Never synthesise the URL from the id: for
 * post-2023 anime the id-based path 404s.
 */
function posterFrom(
  anime: { image?: { original?: string | null; preview?: string | null } },
  size: "original" | "preview",
): string | null {
  const img = anime.image;
  if (!img) return null;
  return size === "original"
    ? imageUrl(img.original) ?? imageUrl(img.preview)
    : imageUrl(img.preview) ?? imageUrl(img.original);
}

function sumStats(stats: Array<{ value: number }> | undefined): number | null {
  if (!stats?.length) return null;
  return stats.reduce((n, s) => n + (s.value ?? 0), 0);
}

function trailerEmbed(videos: ShikiVideo[] | undefined): string | null {
  const pv = videos?.find((v) => v.kind === "pv") ?? videos?.[0];
  if (!pv) return null;
  const url = pv.player_url || pv.url;
  if (!url) return null;
  const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/.exec(url);
  return yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` : url;
}

export function toAnimeSummary(anime: ShikiAnimeShort | ShikiAnimeFull): AnimeSummary {
  const full = "genres" in anime ? anime : null;
  const canonical = anime.name || anime.russian || `anime-${anime.id}`;
  return {
    id: anime.id,
    slug: slugify(`${anime.id}-${canonical}`),
    title: canonical,
    titleEnglish: full?.english?.[0] ?? anime.name ?? null,
    titleJapanese: full?.japanese?.[0] ?? null,
    imageUrl: posterFrom(anime, "preview"),
    imageLargeUrl: posterFrom(anime, "original"),
    type: mapKind(anime.kind),
    airing: mapStatus(anime.status),
    episodes: anime.episodes || null,
    score: anime.score ? Number.parseFloat(anime.score) || null : null,
    year: yearOf(anime.aired_on),
    season: seasonOf(anime.aired_on),
    rank: null,
    members: full ? sumStats(full.rates_statuses_stats) : null,
    genres: full ? full.genres.map((g) => g.russian || g.name) : [],
    synopsis: full ? stripShikimoriMarkup(full.description) : null,
    airedFrom: toIso(anime.aired_on),
    titleLocalized: anime.russian ?? null,
    hasPlayer: null,
    hasCustomPlayer: false,
    rating: full ? mapRating(full.rating) : null,
    scoredBy: full ? sumStats(full.rates_scores_stats) : null,
    trailerEmbedUrl: full ? trailerEmbed(full.videos) : null,
  };
}

export function toAnimeDetail(anime: ShikiAnimeFull): AnimeDetail {
  const genres = anime.genres ?? [];
  return {
    ...toAnimeSummary(anime),
    background: null,
    source: null,
    rating: mapRating(anime.rating),
    duration: anime.duration ? `${anime.duration} мин.` : null,
    popularity: null,
    favorites: anime.favoured ? 1 : null,
    scoredBy: sumStats(anime.rates_scores_stats),
    airedFrom: toIso(anime.aired_on),
    airedTo: toIso(anime.released_on),
    trailerEmbedUrl: trailerEmbed(anime.videos),
    studios: (anime.studios ?? []).map((s) => s.name),
    genresDetailed: dedupeById(
      genres.map((g) => ({ id: g.id, name: g.russian || g.name })),
    ),
    themes: genres.filter((g) => g.kind === "theme").map((g) => g.russian || g.name),
    demographics: genres
      .filter((g) => g.kind === "demographic")
      .map((g) => g.russian || g.name),
    screenshots: (anime.screenshots ?? [])
      .map((s) => imageUrl(s.original))
      .filter((url): url is string => url != null)
      .slice(0, 8),
    bannerImage: null,
    titleLocalized: anime.russian ?? null,
    translated: false,
  };
}

export function toGenreList(genres: ShikiGenre[]): Genre[] {
  // Shikimori has separate Anime/Manga catalogs and some genres exist twice
  // under the same name with different ids (Ecchi = 9 for anime, 51 for
  // manga). We're an anime site — an anime-typed id always wins the dedup,
  // otherwise `genre=<id>` on the anime list endpoint silently matches
  // nothing. Themes/demographics carry no entry_type at all; keep those too.
  const ordered = [...genres].sort((a, b) => {
    const aAnime = a.entry_type == null || a.entry_type === "Anime" ? 0 : 1;
    const bAnime = b.entry_type == null || b.entry_type === "Anime" ? 0 : 1;
    return aAnime - bAnime;
  });
  const seen = new Set<string>();
  const out: Genre[] = [];
  for (const g of ordered) {
    const name = g.russian || g.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: g.id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function toCharacters(roles: ShikiRole[]): Character[] {
  return roles
    .filter((r) => r.character)
    .map((role): Character => {
      const c = role.character!;
      const va = role.person;
      return {
        id: c.id,
        name: c.russian || c.name,
        imageUrl: imageUrl(c.image?.preview ?? c.image?.original),
        role: role.roles?.[0] ?? "Supporting",
        voiceActor: va
          ? {
              name: va.russian || va.name,
              language: "Japanese",
              imageUrl: imageUrl(va.image?.preview),
            }
          : null,
      };
    })
    .sort((a, b) => rolePriority(a.role) - rolePriority(b.role))
    .slice(0, 30);
}

export function toCharacterDetail(raw: {
  id: number;
  name: string;
  russian: string | null;
  japanese?: string | null;
  altname?: string | null;
  image?: { original?: string | null; preview?: string | null } | null;
  description?: string | null;
  seyu?: Array<{
    name: string;
    russian?: string | null;
    image?: { original?: string | null; preview?: string | null } | null;
  }>;
  animes?: ShikiAnimeShort[];
  mangas?: ShikiMangaShort[];
}): CharacterDetail {
  const { intro, sections, facts } = parseCharacterDescription(raw.description);
  const name = raw.russian || raw.name;
  const large = imageUrl(raw.image?.original ?? raw.image?.preview);
  return {
    id: raw.id,
    name,
    originalName: raw.name && raw.name !== name ? raw.name : null,
    japaneseName: raw.japanese ?? null,
    aliases: (raw.altname ?? "")
      .split(",")
      .map((alias) => alias.trim())
      .filter((alias) => alias && alias !== raw.name && alias !== name)
      .slice(0, 8),
    imageUrl: imageUrl(raw.image?.preview ?? raw.image?.original),
    imageLargeUrl: large,
    images: large ? [large] : [],
    description: intro,
    sections,
    facts,
    // The inline "voiced by" tile only ever needs the lead JP seiyu, but the
    // dedicated modal (opened from that tile) shows the whole cast Shikimori
    // knows about, so keep a generous slice rather than the old top-3.
    seiyu: (raw.seyu ?? []).slice(0, 20).map((person) => ({
      name: person.russian || person.name,
      imageUrl: imageUrl(person.image?.preview ?? person.image?.original),
    })),
    animeCount: raw.animes ? raw.animes.length : null,
    mangaCount: raw.mangas ? raw.mangas.length : null,
    animes: (raw.animes ?? []).map((a) => ({
      id: a.id,
      title: a.russian || a.name,
      imageUrl: imageUrl(a.image?.preview ?? a.image?.original),
      kind: a.kind,
      year: yearOf(a.aired_on),
    })),
    mangas: (raw.mangas ?? []).map((m) => ({
      id: m.id,
      title: m.russian || m.name,
      imageUrl: imageUrl(m.image?.preview ?? m.image?.original),
      kind: m.kind,
      year: yearOf(m.aired_on),
    })),
    translated: true, // Shikimori descriptions are already Russian
  };
}

/**
 * The franchise graph's `nodes` list, in release order — every season, movie,
 * spin-off and OVA sharing this title's continuity, including the title
 * itself (flagged `current`). Music videos/PVs occasionally show up as
 * "music"-kind nodes; those are just noise for a "seasons" list, so they're
 * dropped.
 */
export function toFranchiseEntries(raw: ShikiFranchise, currentId: number): FranchiseEntry[] {
  return raw.nodes
    .map((node): FranchiseEntry => ({
      id: node.id,
      title: node.name,
      imageUrl: imageUrl(node.image_url),
      kind: mapKind(node.kind),
      year: node.year,
      current: node.id === currentId,
    }))
    .filter((entry) => entry.kind !== "MUSIC")
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id - b.id);
}

function rolePriority(role: string): number {
  return role.toLowerCase() === "main" ? 0 : 1;
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}
