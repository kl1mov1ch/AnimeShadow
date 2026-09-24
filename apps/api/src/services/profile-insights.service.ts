import { ANIME_WITH_GENRES_INCLUDE, type PrismaClient, toSummaryDto } from "@animeshadow/db";
import type {
  FeedEvent,
  LibraryImportInput,
  LibraryStatus,
  TasteCompare,
  YearRecap,
} from "@animeshadow/shared";
import { BadRequestError, ForbiddenError } from "../lib/errors.js";
import type { AchievementService } from "./achievement.service.js";
import type { CatalogService } from "./catalog.service.js";
import type { ProfileService } from "./profile.service.js";

export interface ProfileInsightsDeps {
  prisma: PrismaClient;
  profile: ProfileService;
  achievements: AchievementService;
  catalog: CatalogService;
}

/** A 24-minute episode, for turning episode counts into hours. */
const EPISODE_SECONDS = 1440;
const FEED_LIMIT = 40;
const PUBLIC_LIST_LIMIT = 120;
/** Titles fetched from upstream during one import, at most. */
const IMPORT_FETCH_LIMIT = 150;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The parts of a profile that are about history rather than identity: the
 * year on a heatmap, the activity feed, the list as others see it, how two
 * lists compare, and moving a list in and out. Every read here checks the
 * owner's privacy for the part it serves.
 */
export class ProfileInsightsService {
  private readonly prisma: PrismaClient;
  private readonly profile: ProfileService;
  private readonly achievements: AchievementService;
  private readonly catalog: CatalogService;

  constructor(deps: ProfileInsightsDeps) {
    this.prisma = deps.prisma;
    this.profile = deps.profile;
    this.achievements = deps.achievements;
    this.catalog = deps.catalog;
  }

  private async guard(ownerId: string, viewerId: string | null, part: "list" | "stats" | "activity" | "watching") {
    if (!(await this.profile.canSee(ownerId, viewerId, part))) {
      throw new ForbiddenError("Владелец скрыл этот раздел профиля.");
    }
  }

  /** A year of watching: episodes per day, and what that adds up to. */
  async year(ownerId: string, viewerId: string | null, year: number): Promise<YearRecap> {
    await this.guard(ownerId, viewerId, "stats");
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const [episodes, completed] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: { userId: ownerId, completed: true, updatedAt: { gte: from, lt: to } },
        select: {
          updatedAt: true,
          durationSeconds: true,
          anime: { select: { genres: { select: { genre: { select: { name: true } } } } } },
        },
      }),
      this.prisma.libraryEntry.count({
        where: { userId: ownerId, status: "COMPLETED", updatedAt: { gte: from, lt: to } },
      }),
    ]);

    const perDay = new Map<string, number>();
    const genres = new Map<string, number>();
    let seconds = 0;
    for (const row of episodes) {
      const key = dayKey(row.updatedAt);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      seconds += row.durationSeconds ?? EPISODE_SECONDS;
      for (const g of row.anime.genres) genres.set(g.genre.name, (genres.get(g.genre.name) ?? 0) + 1);
    }

    const days: YearRecap["days"] = [];
    let streak = 0;
    let longest = 0;
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86_400_000)) {
      const key = dayKey(d);
      const n = perDay.get(key) ?? 0;
      days.push({ day: key, episodes: n });
      streak = n > 0 ? streak + 1 : 0;
      longest = Math.max(longest, streak);
    }
    const busiest = days.reduce<YearRecap["busiestDay"]>(
      (best, day) => (day.episodes > (best?.episodes ?? 0) ? day : best),
      null,
    );
    const topGenre = [...genres].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      year,
      days,
      episodes: episodes.length,
      hours: Math.round((seconds / 3600) * 10) / 10,
      titlesCompleted: completed,
      activeDays: perDay.size,
      longestStreak: longest,
      busiestDay: busiest,
      topGenre,
    };
  }

  /**
   * What happened, newest first: finished titles, episodes (one line per
   * title per day, not one per episode), ratings, additions, achievements.
   * Everything here is a real row with a real timestamp.
   */
  async feed(ownerId: string, viewerId: string | null): Promise<FeedEvent[]> {
    await this.guard(ownerId, viewerId, "activity");
    const [entries, episodes, achievements] = await Promise.all([
      this.prisma.libraryEntry.findMany({
        where: { userId: ownerId },
        orderBy: { updatedAt: "desc" },
        take: 60,
        include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
      }),
      this.prisma.watchProgress.findMany({
        where: { userId: ownerId, completed: true },
        orderBy: { updatedAt: "desc" },
        take: 120,
        include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
      }),
      this.achievements.list(ownerId),
    ]);

    const events: FeedEvent[] = [];
    for (const entry of entries) {
      const anime = toSummaryDto(entry.anime);
      if (entry.status === "COMPLETED") {
        events.push({ kind: "completed", at: entry.updatedAt.toISOString(), anime, value: null });
      } else if (entry.progress === 0) {
        events.push({ kind: "added", at: entry.createdAt.toISOString(), anime, value: null });
      }
      if (entry.score != null) {
        events.push({
          kind: "rated",
          at: new Date(entry.updatedAt.getTime() - 1).toISOString(),
          anime,
          value: entry.score,
        });
      }
    }
    const seen = new Set<string>();
    for (const row of episodes) {
      const key = `${row.animeId}:${dayKey(row.updatedAt)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        kind: "episode",
        at: row.updatedAt.toISOString(),
        anime: toSummaryDto(row.anime),
        value: row.episode,
      });
    }
    for (const a of achievements) {
      if (a.earned && a.earnedAt) {
        events.push({ kind: "achievement", at: a.earnedAt, anime: null, value: a.id });
      }
    }
    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, FEED_LIMIT);
  }

  /** The list as someone else sees it. */
  async publicList(ownerId: string, viewerId: string | null, status?: LibraryStatus) {
    await this.guard(ownerId, viewerId, "list");
    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId: ownerId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" },
      take: PUBLIC_LIST_LIMIT,
      include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
    });
    return rows.map((row) => ({
      anime: toSummaryDto(row.anime),
      status: row.status,
      score: row.score,
      progress: row.progress,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /** What watching now looks like, for the profile's "now watching" card. */
  async watching(ownerId: string, viewerId: string | null) {
    await this.guard(ownerId, viewerId, "watching");
    const rows = await this.prisma.watchProgress.findMany({
      where: { userId: ownerId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
    });
    const seen = new Set<number>();
    const out = [];
    for (const row of rows) {
      if (seen.has(row.animeId)) continue;
      seen.add(row.animeId);
      out.push({
        anime: toSummaryDto(row.anime),
        episode: row.episode,
        positionSeconds: row.positionSeconds,
        completed: row.completed,
        at: row.updatedAt.toISOString(),
      });
      if (out.length >= 4) break;
    }
    return out;
  }

  /**
   * How alike two lists are. Half of it is overlap — of the smaller list,
   * how much the other also has — and half is agreement on the titles both
   * scored. Shared genres are the ones both lists lean toward.
   */
  async compare(ownerId: string, viewerId: string): Promise<TasteCompare> {
    await this.guard(ownerId, viewerId, "list");
    const load = (userId: string) =>
      this.prisma.libraryEntry.findMany({
        where: { userId, status: { not: "DROPPED" } },
        include: { anime: { include: ANIME_WITH_GENRES_INCLUDE } },
      });
    const [theirs, mine] = await Promise.all([load(ownerId), load(viewerId)]);
    const mineById = new Map(mine.map((e) => [e.animeId, e]));
    const common = theirs.filter((e) => mineById.has(e.animeId));

    const overlap =
      Math.min(theirs.length, mine.length) > 0
        ? common.length / Math.min(theirs.length, mine.length)
        : 0;
    const pairs = common.filter((e) => e.score != null && mineById.get(e.animeId)!.score != null);
    const agreement =
      pairs.length > 0
        ? 1 -
          pairs.reduce((sum, e) => sum + Math.abs(e.score! - mineById.get(e.animeId)!.score!), 0) /
            pairs.length /
            9
        : 0.5;
    const percent = common.length === 0 ? 0 : Math.round(100 * (0.5 * overlap + 0.5 * agreement));

    const genreWeights = (list: typeof mine) => {
      const map = new Map<string, number>();
      for (const e of list) for (const g of e.anime.genres) map.set(g.genre.name, (map.get(g.genre.name) ?? 0) + 1);
      return new Set([...map].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name));
    };
    const theirGenres = genreWeights(theirs);
    const sharedGenres = [...genreWeights(mine)].filter((g) => theirGenres.has(g)).slice(0, 5);

    return {
      percent,
      sharedCount: common.length,
      common: common
        .sort((a, b) => (b.score ?? 0) + (mineById.get(b.animeId)!.score ?? 0) - ((a.score ?? 0) + (mineById.get(a.animeId)!.score ?? 0)))
        .slice(0, 12)
        .map((e) => ({
          anime: toSummaryDto(e.anime),
          theirs: e.score,
          mine: mineById.get(e.animeId)!.score,
        })),
      sharedGenres,
    };
  }

  /** The whole list, in our own JSON or MyAnimeList's XML export format. */
  async exportList(userId: string, format: "json" | "mal"): Promise<{ body: string; type: string; name: string }> {
    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId },
      include: { anime: { select: { id: true, title: true, episodes: true, type: true } } },
      orderBy: { updatedAt: "desc" },
    });
    if (format === "json") {
      const body = JSON.stringify(
        rows.map((r) => ({
          animeId: r.animeId,
          title: r.anime.title,
          status: r.status,
          score: r.score,
          progress: r.progress,
          notes: r.notes,
        })),
        null,
        2,
      );
      return { body, type: "application/json", name: "animeshadow-list.json" };
    }
    const malStatus: Record<LibraryStatus, string> = {
      WATCHING: "Watching",
      COMPLETED: "Completed",
      ON_HOLD: "On-Hold",
      DROPPED: "Dropped",
      PLANNED: "Plan to Watch",
    };
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
    const items = rows
      .map(
        (r) => `  <anime>
    <series_animedb_id>${r.animeId}</series_animedb_id>
    <series_title><![CDATA[${r.anime.title}]]></series_title>
    <series_episodes>${r.anime.episodes ?? 0}</series_episodes>
    <my_watched_episodes>${r.progress}</my_watched_episodes>
    <my_score>${r.score ?? 0}</my_score>
    <my_status>${malStatus[r.status]}</my_status>
    <my_comments><![CDATA[${esc(r.notes ?? "")}]]></my_comments>
    <update_on_import>1</update_on_import>
  </anime>`,
      )
      .join("\n");
    const body = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo>
    <user_export_type>1</user_export_type>
  </myinfo>
${items}
</myanimelist>
`;
    return { body, type: "application/xml", name: "animelist.xml" };
  }

  /**
   * A list brought in from elsewhere. Our ids are MyAnimeList's, and
   * Shikimori's are too, so entries map one to one; a title the catalogue
   * hasn't seen yet is fetched (up to a limit per import) before it is
   * added. Imported values replace what was there for the same title.
   */
  async importList(userId: string, input: LibraryImportInput) {
    const parsed = parseImport(input);
    if (parsed.length === 0) throw new BadRequestError("В файле не нашлось ни одного тайтла.");

    const ids = [...new Set(parsed.map((p) => p.animeId))];
    const known = new Set(
      (await this.prisma.anime.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((a) => a.id),
    );
    const missing = ids.filter((id) => !known.has(id)).slice(0, IMPORT_FETCH_LIMIT);
    for (let i = 0; i < missing.length; i += 4) {
      await Promise.all(
        missing.slice(i, i + 4).map((id) =>
          this.catalog
            .getAnimeById(id, "ru")
            .then(() => known.add(id))
            .catch(() => undefined),
        ),
      );
    }

    let imported = 0;
    for (const item of parsed) {
      if (!known.has(item.animeId)) continue;
      await this.prisma.libraryEntry.upsert({
        where: { userId_animeId: { userId, animeId: item.animeId } },
        create: { userId, animeId: item.animeId, status: item.status, score: item.score, progress: item.progress },
        update: { status: item.status, score: item.score, progress: item.progress },
      });
      imported++;
    }
    void this.achievements.recompute(userId).catch(() => undefined);
    return { total: parsed.length, imported, skipped: parsed.length - imported };
  }
}

interface ImportItem {
  animeId: number;
  status: LibraryStatus;
  score: number | null;
  progress: number;
}

const clampScore = (n: number) => (Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : null);

function parseImport(input: LibraryImportInput): ImportItem[] {
  if (input.format === "mal") {
    const byStatus: Record<string, LibraryStatus> = {
      watching: "WATCHING",
      completed: "COMPLETED",
      "on-hold": "ON_HOLD",
      dropped: "DROPPED",
      "plan to watch": "PLANNED",
    };
    const out: ImportItem[] = [];
    for (const block of input.content.split(/<anime>/i).slice(1)) {
      const tag = (name: string) =>
        block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[)?([^<\\]]*)`, "i"))?.[1]?.trim() ?? "";
      const animeId = Number(tag("series_animedb_id"));
      const status = byStatus[tag("my_status").toLowerCase()];
      if (!Number.isInteger(animeId) || animeId <= 0 || !status) continue;
      out.push({
        animeId,
        status,
        score: clampScore(Number(tag("my_score"))),
        progress: Math.max(0, Number(tag("my_watched_episodes")) || 0),
      });
    }
    return out;
  }

  let data: unknown;
  try {
    data = JSON.parse(input.content);
  } catch {
    throw new BadRequestError("Файл не похож на JSON.");
  }
  if (!Array.isArray(data)) throw new BadRequestError("Ожидался список тайтлов.");

  if (input.format === "shikimori") {
    const byStatus: Record<string, LibraryStatus> = {
      watching: "WATCHING",
      rewatching: "WATCHING",
      completed: "COMPLETED",
      on_hold: "ON_HOLD",
      dropped: "DROPPED",
      planned: "PLANNED",
    };
    return data.flatMap((row: Record<string, unknown>) => {
      if (row.target_type && row.target_type !== "Anime") return [];
      const animeId = Number(row.target_id);
      const status = byStatus[String(row.status)];
      if (!Number.isInteger(animeId) || !status) return [];
      return [{ animeId, status, score: clampScore(Number(row.score)), progress: Math.max(0, Number(row.episodes) || 0) }];
    });
  }

  const valid = new Set(["WATCHING", "PLANNED", "COMPLETED", "ON_HOLD", "DROPPED"]);
  return data.flatMap((row: Record<string, unknown>) => {
    const animeId = Number(row.animeId);
    const status = String(row.status);
    if (!Number.isInteger(animeId) || !valid.has(status)) return [];
    return [{ animeId, status: status as LibraryStatus, score: clampScore(Number(row.score)), progress: Math.max(0, Number(row.progress) || 0) }];
  });
}
