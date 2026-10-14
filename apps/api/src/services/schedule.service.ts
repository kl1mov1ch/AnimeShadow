import type { PrismaClient } from "@animeshadow/db";
import type { AniListClient } from "@animeshadow/anilist";
import type { ScheduleItem, ScheduleWeek } from "@animeshadow/shared";
import type { FastifyBaseLogger } from "fastify";
import { isAdultRating, isHentaiRating } from "../lib/content-guard.js";

const DAY_MS = 86_400_000;
const MSK = 3 * 3_600_000;
/** A week's broadcasts change rarely (a delay, a break): half an hour is fresh enough. */
const TTL_MS = 30 * 60_000;

type Row = Omit<ScheduleItem, "mine"> & { rating: string | null };

/** Monday 00:00 Moscow time of the week `offset` weeks from now. */
function weekStart(offset: number, now = Date.now()): number {
  const msk = now + MSK;
  const dayStart = Math.floor(msk / DAY_MS) * DAY_MS;
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday = 0
  return dayStart - dow * DAY_MS - MSK + offset * 7 * DAY_MS;
}

/**
 * The broadcast schedule, a week at a time: every episode AniList knows to
 * air (Japanese time) between Monday and Sunday, for the titles we have —
 * matched by MyAnimeList id, which is our own numbering, so nothing is
 * guessed by name. Kept for half an hour; the person's own list is marked
 * on each request.
 */
export class ScheduleService {
  private cache = new Map<number, { at: number; rows: Row[]; pending?: Promise<Row[]> }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly anilist: AniListClient,
    private readonly log: FastifyBaseLogger,
  ) {}

  async week(offset: number, userId: string | undefined, allowAdult: boolean): Promise<ScheduleWeek> {
    const from = weekStart(offset);
    const to = from + 7 * DAY_MS;
    const rows = (await this.rows(from, to)).filter(
      (r) => !isHentaiRating(r.rating) && (allowAdult || !isAdultRating(r.rating)),
    );
    let mine = new Set<number>();
    if (userId && rows.length > 0) {
      const entries = await this.prisma.libraryEntry.findMany({
        where: { userId, animeId: { in: [...new Set(rows.map((r) => r.anime.id))] }, status: { in: ["WATCHING", "PLANNED", "ON_HOLD"] } },
        select: { animeId: true },
      });
      mine = new Set(entries.map((e) => e.animeId));
    }
    return {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      week: offset,
      items: rows.map(({ rating: _rating, ...r }) => ({ ...r, mine: mine.has(r.anime.id) })),
    };
  }

  /** This week and the next, fetched ahead (at start and every 25 minutes) so no visitor waits on AniList. */
  async warm(): Promise<void> {
    for (const offset of [0, 1]) {
      const from = weekStart(offset);
      await this.refresh(from, from + 7 * DAY_MS);
    }
  }

  private async rows(from: number, to: number): Promise<Row[]> {
    const hit = this.cache.get(from);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
    // Stale but there: answered at once, refreshed behind it.
    if (hit && hit.at > 0) {
      if (!hit.pending) void this.refresh(from, to);
      return hit.rows;
    }
    if (hit?.pending) return hit.pending;
    return this.refresh(from, to);
  }

  private refresh(from: number, to: number): Promise<Row[]> {
    const hit = this.cache.get(from);
    if (hit?.pending) return hit.pending;
    const pending = this.load(from, to)
      .then((rows) => {
        // AniList down answers nothing: keep the week we had rather than empty it.
        const kept = rows.length === 0 && hit?.rows.length ? hit.rows : rows;
        this.cache.set(from, { at: Date.now(), rows: kept });
        return kept;
      })
      .catch((error: unknown) => {
        this.log.warn({ err: (error as Error).message }, "schedule load failed");
        // A stale week beats an empty one.
        if (hit) {
          this.cache.set(from, { ...hit, pending: undefined });
          return hit.rows;
        }
        this.cache.delete(from);
        return [];
      });
    this.cache.set(from, { at: hit?.at ?? 0, rows: hit?.rows ?? [], pending });
    if (this.cache.size > 8) {
      const oldest = [...this.cache.keys()].sort((a, b) => a - b)[0]!;
      this.cache.delete(oldest);
    }
    return pending;
  }

  private async load(from: number, to: number): Promise<Row[]> {
    const airings = await this.anilist.getAiringSchedule(Math.floor(from / 1000) - 1, Math.floor(to / 1000));
    if (airings.length === 0) throw new Error("AniList returned no airings");
    const anime = await this.prisma.anime.findMany({
      where: { id: { in: [...new Set(airings.map((a) => a.malId))] } },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, type: true, score: true, episodes: true, rating: true },
    });
    const byId = new Map(anime.map((a) => [a.id, a]));
    const out: Row[] = [];
    for (const a of airings) {
      const title = byId.get(a.malId);
      if (!title) continue;
      out.push({
        airingAt: new Date(a.airingAt * 1000).toISOString(),
        episode: a.episode,
        episodes: title.episodes,
        rating: title.rating,
        anime: {
          id: title.id,
          slug: title.slug,
          title: title.title,
          titleLocalized: title.titleLocalized,
          imageUrl: title.imageUrl,
          type: title.type,
          score: title.score,
        },
      });
    }
    this.log.info({ from: new Date(from).toISOString(), airings: airings.length, matched: out.length }, "schedule loaded");
    return out;
  }
}
