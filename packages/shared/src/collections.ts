import { z } from "zod";
import type { AnimeSummary } from "./anime.js";

/** Collections a free account may keep at once; PRO has no limit. */
export const FREE_COLLECTION_LIMIT = 3;

/**
 * The criteria an author picks for a collection — what it's for and what
 * it feels like. Fixed keys (labels live in the dictionaries), so the feed
 * can filter by them.
 */
export const COLLECTION_TAGS = [
  "newcomers",
  "veterans",
  "cozy",
  "dark",
  "funny",
  "tearjerker",
  "epic",
  "mindbending",
  "romance",
  "short",
  "movies",
  "binge",
  "hidden-gems",
  "classics",
] as const;
export type CollectionTag = (typeof COLLECTION_TAGS)[number];
export const MAX_COLLECTION_TAGS = 5;

const text = z.object({
  type: z.literal("text"),
  /** A paragraph (or several — blank lines split them). */
  text: z.string().trim().min(1).max(4000),
});
const anime = z.object({
  type: z.literal("anime"),
  animeId: z.number().int().positive(),
  /** The author's own words: why this one is here. */
  note: z.string().trim().max(1500).default(""),
  /** The author's own score, 1–10. */
  score: z.number().int().min(1).max(10).nullable().default(null),
  /** "Watch this one no matter what" — a badge on the card. */
  mustWatch: z.boolean().default(false),
  /** The note gives the plot away: hidden until asked for. */
  spoiler: z.boolean().default(false),
  /** How to watch it — "from season 2", "the film first". */
  watchTip: z.string().trim().max(120).default(""),
});
/** A section of the collection — its title also goes into the contents. */
const heading = z.object({
  type: z.literal("heading"),
  text: z.string().trim().min(1).max(120),
});
const quote = z.object({
  type: z.literal("quote"),
  text: z.string().trim().min(1).max(600),
  /** Who said it — a character, an author. */
  by: z.string().trim().max(80).default(""),
});
export const CALLOUT_VARIANTS = ["tip", "warning", "info"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];
const callout = z.object({
  type: z.literal("callout"),
  variant: z.enum(CALLOUT_VARIANTS).default("tip"),
  text: z.string().trim().min(1).max(1000),
});
const divider = z.object({ type: z.literal("divider") });
export const collectionBlockSchema = z.discriminatedUnion("type", [text, anime, heading, quote, callout, divider]);
export type CollectionBlock = z.infer<typeof collectionBlockSchema>;

/** How the anime are laid out: one under another, a numbered top, a grid of posters. */
export const COLLECTION_LAYOUTS = ["list", "ranked", "grid"] as const;
export type CollectionLayout = (typeof COLLECTION_LAYOUTS)[number];
/** The colours an author can give a collection. */
export const COLLECTION_ACCENTS = ["#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"] as const;

export const collectionInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    summary: z.string().trim().max(400).default(""),
    tags: z.array(z.enum(COLLECTION_TAGS)).max(MAX_COLLECTION_TAGS).default([]),
    blocks: z.array(collectionBlockSchema).min(1).max(80),
    published: z.boolean().default(true),
    layout: z.enum(COLLECTION_LAYOUTS).default("list"),
    accent: z.enum(COLLECTION_ACCENTS).nullable().default(null),
    allowComments: z.boolean().default(true),
  })
  .refine((c) => c.blocks.some((b) => b.type === "anime"), {
    message: "Добавьте в подборку хотя бы одно аниме.",
    path: ["blocks"],
  })
  .refine((c) => c.blocks.filter((b) => b.type === "anime").length <= 50, {
    message: "В подборке может быть не больше 50 аниме.",
    path: ["blocks"],
  });
export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const COLLECTION_SORTS = ["popular", "new", "top"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export const collectionQuerySchema = z.object({
  sort: z.enum(COLLECTION_SORTS).default("popular"),
  tag: z.enum(COLLECTION_TAGS).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(48).default(18),
});
export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

export interface CollectionAuthor {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  isPro: boolean;
}

/** One frame of the cover: an anime's poster (and its wide art, if any). */
export interface CollectionCoverItem {
  id: number;
  slug: string;
  title: string;
  image: string | null;
  banner: string | null;
}

export interface CollectionSummary {
  id: string;
  title: string;
  summary: string;
  tags: CollectionTag[];
  author: CollectionAuthor;
  cover: CollectionCoverItem[];
  animeCount: number;
  published: boolean;
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  blocks: CollectionBlock[];
  layout: CollectionLayout;
  accent: string | null;
  allowComments: boolean;
  /** Every anime the blocks mention, by id. */
  anime: Record<number, AnimeSummary>;
  /** The viewer's own rating, 1–5, if they gave one. */
  myRating: number | null;
  /** How many 1s … 5s. */
  ratingDist: [number, number, number, number, number];
  canEdit: boolean;
}

export interface CollectionLimit {
  used: number;
  /** null: no limit (PRO). */
  max: number | null;
}

export const collectionRatingSchema = z.object({ value: z.number().int().min(1).max(5) });

export const collectionCommentInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  /** Answering another comment of the same collection. */
  parentId: z.string().min(1).max(64).optional(),
});

export interface CollectionComment {
  id: string;
  body: string;
  createdAt: string;
  author: CollectionAuthor;
  /** The comment this answers (top-level of its thread), if any. */
  parentId: string | null;
  /** Who is being answered — shown as "→ name". */
  replyTo: { id: string; displayName: string } | null;
  /** Written by the collection's own author. */
  byCollectionAuthor: boolean;
  mine: boolean;
  canDelete: boolean;
}

export const collectionViewSchema = z.object({ visitorId: z.string().min(8).max(64) });

/** Everything the author sees about one collection. */
export interface CollectionStats {
  id: string;
  title: string;
  totals: {
    views: number;
    uniqueVisitors30d: number;
    ratingAvg: number | null;
    ratingCount: number;
    comments: number;
  };
  /** Last 30 days, oldest first, zero-filled. */
  daily: Array<{ date: string; views: number; comments: number }>;
  /** How many 1s … 5s. */
  ratings: [number, number, number, number, number];
}

/** The author's overview across all their collections. */
export interface MyCollectionsStats {
  limit: CollectionLimit;
  totals: { views: number; ratings: number; ratingAvg: number | null; comments: number };
  daily: Array<{ date: string; views: number }>;
  collections: Array<{
    id: string;
    title: string;
    published: boolean;
    views: number;
    views7d: number;
    ratingAvg: number | null;
    ratingCount: number;
    comments: number;
    createdAt: string;
  }>;
}
