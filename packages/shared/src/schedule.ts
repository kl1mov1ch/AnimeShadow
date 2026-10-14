import type { AnimeType } from "./enums.js";

/** One episode's broadcast, matched to a title in our catalogue. */
export interface ScheduleItem {
  /** ISO time of the Japanese broadcast. */
  airingAt: string;
  episode: number;
  /** The title's total, when known ("7 / 12"). */
  episodes: number | null;
  anime: {
    id: number;
    slug: string;
    title: string;
    titleLocalized: string | null;
    imageUrl: string | null;
    type: AnimeType;
    score: number | null;
  };
  /** In the viewer's list (watching, planned or on hold). */
  mine: boolean;
}

export interface ScheduleWeek {
  /** Monday 00:00 Moscow time of the week shown. */
  from: string;
  to: string;
  /** Weeks from the current one (0 = this week). */
  week: number;
  items: ScheduleItem[];
}

/** Where a title's skippable parts are, from AniSkip, with the episode length each was marked on. */
export interface SkipSegmentRaw {
  kind: "op" | "ed" | "recap";
  start: number;
  stop: number;
  /** Seconds of the episode version the times were marked on (0 = unknown). */
  length: number;
}
