import { z } from "zod";
import {
  animeAiringSchema,
  animeOrderBySchema,
  animeSeasonSchema,
  animeTypeSchema,
} from "./enums.js";

export const genreSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  count: z.number().int().nonnegative().optional(),
});
export type Genre = z.infer<typeof genreSchema>;

/** The shape a card needs. Kept deliberately small — this is the hot path. */
export const animeSummarySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  titleEnglish: z.string().nullable(),
  titleJapanese: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageLargeUrl: z.string().nullable(),
  type: animeTypeSchema,
  airing: animeAiringSchema,
  episodes: z.number().int().nullable(),
  score: z.number().nullable(),
  year: z.number().int().nullable(),
  season: animeSeasonSchema.nullable(),
  rank: z.number().int().nullable(),
  members: z.number().int().nullable(),
  genres: z.array(z.string()),
  synopsis: z.string().nullable(),
  /** ISO date the title started / will start airing — drives the card countdown. */
  airedFrom: z.string().nullable().default(null),
  /** Localised (Russian) title, when known. */
  titleLocalized: z.string().nullable().default(null),
  /** true = an embed player has this title; false = confirmed none; null = unknown. */
  hasPlayer: z.boolean().nullable().default(null),
  /** true = playable in our own HLS player, no third-party iframe. */
  hasCustomPlayer: z.boolean().default(false),
  /** MAL-style content rating ("Rx" = hentai) — null until the title's been detail-synced. */
  rating: z.string().nullable().default(null),
  /** How many users scored it — the card's "votes" figure. Null until detail-synced. */
  scoredBy: z.number().int().nullable().default(null),
  /** YouTube-nocookie (or provider) embed URL — the card's trailer link. */
  trailerEmbedUrl: z.string().nullable().default(null),
});
export type AnimeSummary = z.infer<typeof animeSummarySchema>;

export const animeDetailSchema = animeSummarySchema.extend({
  background: z.string().nullable(),
  source: z.string().nullable(),
  duration: z.string().nullable(),
  popularity: z.number().int().nullable(),
  favorites: z.number().int().nullable(),
  airedFrom: z.string().nullable(),
  airedTo: z.string().nullable(),
  studios: z.array(z.string()),
  genresDetailed: z.array(genreSchema),
  themes: z.array(z.string()),
  demographics: z.array(z.string()),
  /** Landscape frames from the show — used as hero / ambient backdrops. */
  screenshots: z.array(z.string()).default([]),
  /** Wide official key-visual banner (AniList) — the spotlight's preferred backdrop. */
  bannerImage: z.string().nullable().default(null),
  /**
   * Dominant colour of the cover art, as `#rrggbb` (AniList). Lets a title
   * page take on its own key visual's colour without the browser sampling
   * the poster's pixels, which it can only do after the image has loaded.
   */
  accentColor: z.string().nullable().default(null),
  /**
   * AniList community tags with how strongly each was voted to apply, 0-100,
   * strongest first. Spoiler tags are filtered out upstream. Same
   * `.optional()` reasoning as `nextEpisode` below — no provider mapper
   * knows these, only the live AniList lookup sets them.
   */
  tags: z
    .array(z.object({ name: z.string(), rank: z.number().int() }))
    .optional(),
  /** Official, legal places to watch this (AniList external links). */
  streamingLinks: z
    .array(
      z.object({
        site: z.string(),
        url: z.string(),
        language: z.string().nullable(),
      }),
    )
    .optional(),
  /** True when `synopsis` is in the requested locale. */
  translated: z.boolean().default(false),
  /**
   * When and which episode airs next (AniList), for titles still airing.
   * `.optional()` on purpose — every upstream-source mapper (Shikimori,
   * Jikan, Kodik) builds an `AnimeDetail` object literal directly, and none
   * of them know this; only the live AniList lookup in catalog.service.ts
   * ever sets it, so it must be safe to simply omit.
   */
  nextEpisode: z
    .object({ episode: z.number().int(), airingAt: z.string() })
    .nullable()
    .optional(),
  /**
   * Studio name → logo URL (MAL/Jikan producer artwork), best-effort. Same
   * `.optional()` reasoning as `nextEpisode` above — only catalog.service's
   * live lookup ever sets it; provider mappers never do. Missing entries
   * (unresolved or no upstream match) are simply absent from the map, not
   * null, so the UI can treat "not in the map" as "no logo".
   */
  studioLogos: z.record(z.string(), z.string()).optional(),
});
export type AnimeDetail = z.infer<typeof animeDetailSchema>;

export const characterSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  role: z.string(),
  voiceActor: z
    .object({ name: z.string(), language: z.string(), imageUrl: z.string().nullable() })
    .nullable(),
});
export type Character = z.infer<typeof characterSchema>;

export const characterDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** Romanised name when the display name is localised. */
  originalName: z.string().nullable().default(null),
  japaneseName: z.string().nullable(),
  aliases: z.array(z.string()).default([]),
  imageUrl: z.string().nullable(),
  imageLargeUrl: z.string().nullable(),
  /** Gallery, main portrait first. */
  images: z.array(z.string()).default([]),
  /** The part of the bio before the first titled section. */
  description: z.string().nullable(),
  /** Titled parts of the bio — Appearance, History, Personality… */
  sections: z.array(z.object({ title: z.string(), body: z.string() })).default([]),
  /** Trivia/backstory reveals the source tags as spoilers — shown as its own section. */
  facts: z.array(z.string()).default([]),
  seiyu: z.array(z.object({ name: z.string(), imageUrl: z.string().nullable() })).default([]),
  animeCount: z.number().int().nullable().default(null),
  mangaCount: z.number().int().nullable().default(null),
  /** Titles this character appears in — for the "appears in" modal, so it's more than just a count. */
  animes: z
    .array(
      z.object({
        id: z.number().int(),
        title: z.string(),
        imageUrl: z.string().nullable(),
        kind: z.string().nullable(),
        year: z.number().int().nullable(),
      }),
    )
    .default([]),
  mangas: z
    .array(
      z.object({
        id: z.number().int(),
        title: z.string(),
        imageUrl: z.string().nullable(),
        kind: z.string().nullable(),
        year: z.number().int().nullable(),
      }),
    )
    .default([]),
  /** True when `description` is already in the requested locale. */
  translated: z.boolean().default(false),
});
export type CharacterDetail = z.infer<typeof characterDetailSchema>;

/** One entry in a title's franchise — a season, movie, spin-off or OVA sharing its continuity. */
export const franchiseEntrySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  kind: animeTypeSchema,
  year: z.number().int().nullable(),
  /** True for the title the viewer is already looking at — shown, not linked. */
  current: z.boolean(),
});
export type FranchiseEntry = z.infer<typeof franchiseEntrySchema>;

/**
 * Browse / search query. Everything is optional; the API applies defaults.
 * `coerce` lets it parse straight from URL query strings.
 */
export const animeQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  // Sanity ceiling only — the catalogue is already past the old cap of 100
  // pages, which made every page beyond it 422 instead of just "empty".
  page: z.coerce.number().int().positive().max(2000).default(1),
  perPage: z.coerce.number().int().positive().max(48).default(24),
  type: animeTypeSchema.optional(),
  airing: animeAiringSchema.optional(),
  genres: z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(","))
        .map((entry) => Number.parseInt(entry, 10))
        .filter((entry) => Number.isInteger(entry)),
    )
    .pipe(z.array(z.number().int()))
    .optional(),
  minScore: z.coerce.number().min(0).max(10).optional(),
  /** Exact studio name — the click-through from an anime's own studio credit. */
  studio: z.string().trim().min(1).max(120).optional(),
  year: z.coerce.number().int().min(1917).max(2100).optional(),
  season: animeSeasonSchema.optional(),
  orderBy: animeOrderBySchema.default("popularity"),
  sort: z.enum(["asc", "desc"]).default("desc"),
  sfw: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true")
    .default(true),
  /** Only titles with a playable embed. */
  hasPlayer: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true" || value === "1")
    .optional(),
  /** Only titles playable in our own HLS player — no third-party iframe. */
  hasCustomPlayer: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true" || value === "1")
    .optional(),
});
export type AnimeQuery = z.infer<typeof animeQuerySchema>;
export type AnimeQueryInput = z.input<typeof animeQuerySchema>;

/**
 * A title's opening, as a plain video file (AnimeThemes). Used as motion on
 * the page — the hero's backdrop, a card's hover preview — which is why the
 * size matters enough to travel with it: the client decides whether to
 * autoplay based on how big the file actually is.
 */
export const animeOpeningSchema = z.object({
  kind: z.enum(["OP", "ED"]).default("OP"),
  url: z.string(),
  /** Audio-only track, when the archive has one — what the theme player uses. */
  audioUrl: z.string().nullable().default(null),
  song: z.string().nullable(),
  artist: z.string().nullable().default(null),
  slug: z.string(),
  resolution: z.number().int().nullable(),
  size: z.number().int().nullable(),
  /** The archive's own page for this title. */
  pageUrl: z.string().nullable().default(null),
});
export type AnimeOpening = z.infer<typeof animeOpeningSchema>;

/** Every theme the archive has for a title — the page's mini library. */
export const animeThemesSchema = z.object({
  tracks: z.array(animeOpeningSchema).default([]),
  opening: animeOpeningSchema.nullable(),
  /**
   * Present only when the upstream lookup failed — as distinct from the
   * archive simply having nothing. Exposed on purpose: it is the one way to
   * tell, from a browser, why the soundtrack section is not showing.
   */
  error: z.string().optional(),
});
export type AnimeThemes = z.infer<typeof animeThemesSchema>;

export const recommendationItemSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  votes: z.number().int().nonnegative(),
});
export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

export const discoverResponseSchema = z.object({
  spotlight: animeDetailSchema.nullable(),
  /** Rotating hero — several airing titles, trailers preferred. */
  spotlights: z.array(animeDetailSchema).default([]),
  topAiring: z.array(animeSummarySchema),
  thisSeason: z.array(animeSummarySchema),
  allTimeTop: z.array(animeSummarySchema),
  mostPopular: z.array(animeSummarySchema),
  /** Real watch-activity ranking — our own visitors, last ~2 days. */
  trendingNow: z.array(animeSummarySchema).default([]),
  /** Same signal, wider ~30-day window — sustained rather than momentary. */
  trendingMonth: z.array(animeSummarySchema).default([]),
  /** Announced/not-yet-aired titles, soonest first. */
  upcoming: z.array(animeSummarySchema).default([]),
});
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

/**
 * How the wider anime audience is tracking a title — plain counts from
 * MAL via Jikan, not our own visitors (the profile's charts are the
 * place for those). Every field nullable: the upstream is optional and a
 * missing number should read as "unknown", never as zero.
 */
export const animeStatsSchema = z.object({
  watching: z.number().int().nonnegative().nullable(),
  completed: z.number().int().nonnegative().nullable(),
  onHold: z.number().int().nonnegative().nullable(),
  dropped: z.number().int().nonnegative().nullable(),
  planToWatch: z.number().int().nonnegative().nullable(),
  total: z.number().int().nonnegative().nullable(),
});
export type AnimeStats = z.infer<typeof animeStatsSchema>;
