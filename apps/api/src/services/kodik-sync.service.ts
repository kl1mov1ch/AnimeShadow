import { type AnimeRow, Prisma, type PrismaClient, toAnimeRow } from "@animeshadow/db";
import type { NotificationService } from "./notification.service.js";
import { type KodikClient, type KodikGroup, toAnimeDetail } from "@animeshadow/kodik";
import type { FastifyBaseLogger } from "fastify";

export interface KodikSyncDeps {
  prisma: PrismaClient;
  kodik: KodikClient;
  logger: FastifyBaseLogger;
  /** Told each title's newest episode on every pass (new-episode notifications). */
  notifications?: NotificationService;
}

/** The newest episode in a group: the highest any of its dubs has. */
function latestEpisode(g: KodikGroup): number {
  return Math.max(0, ...g.translations.map((t) => Number(t.last_episode ?? t.episodes_count ?? 0) || 0));
}

/** Kodik answers at most 100 rows a page. */
const PAGE = 100;
/** A "recent" pass reads this many pages of the most recently updated rows. */
const RECENT_PAGES = 15;
const FULL_KEY = "kodik-full";
const RECENT_KEY = "kodik-recent";

/** Kodik's MPAA-style rating → the rating strings the rest of the catalogue uses
 *  (the content guard reads their prefixes: "Rx", "R+"). */
const RATING: Record<string, string> = {
  g: "G - All Ages",
  pg: "PG - Children",
  "pg-13": "PG-13 - Teens 13 or older",
  pg_13: "PG-13 - Teens 13 or older",
  r: "R - 17+",
  "r+": "R+ - Mild Nudity",
  r_plus: "R+ - Mild Nudity",
  rx: "Rx - Hentai",
};

const NEVER = /^(хентай|hentai|эротика|erotica)$/i;

/**
 * The catalogue, filled from Kodik's own catalogue API (/list, with the
 * project's token): every anime Kodik can play — about twenty thousand —
 * gets a row with its titles, poster, genres, type, status, episodes and
 * rating, and is marked as having a player. Before this, titles got into
 * the catalogue only one by one, as someone browsed or the warm-up pass
 * reached them, so most playable anime simply weren't there.
 *
 * Existing rows are never overwritten — Shikimori's detail data is richer;
 * only gaps (no poster, no Russian title) are filled. Synopses arrive later
 * through the catalogue's detail warm-up (Kodik's list doesn't carry them).
 * Hentai is never imported.
 */
export class KodikCatalogSync {
  private readonly prisma: PrismaClient;
  private readonly kodik: KodikClient;
  private readonly log: FastifyBaseLogger;
  private readonly notifications?: NotificationService;
  private checking = false;

  /**
   * The quick check for new episodes: the 200 most recently updated rows
   * on Kodik — two requests — every twenty minutes, nothing stored but
   * the episode marks (see NotificationService).
   */
  async checkNewEpisodes(): Promise<void> {
    if (!this.notifications || this.checking) return;
    this.checking = true;
    try {
      let cursor: string | undefined;
      const latest = new Map<number, number>();
      for (let page = 0; page < 2; page++) {
        const { groups, nextCursor } = await this.kodik.list(
          { types: "anime-serial", sort: "updated_at", order: "desc", limit: PAGE, has_field: "shikimori_id" },
          cursor,
        );
        for (const g of groups) if (!this.isHentai(g)) latest.set(g.shikimoriId, Math.max(latest.get(g.shikimoriId) ?? 0, latestEpisode(g)));
        if (!nextCursor) break;
        cursor = nextCursor;
      }
      await this.notifications.observe(latest);
    } catch (error) {
      this.log.warn({ err: error }, "new episode check failed");
    } finally {
      this.checking = false;
    }
  }
  private running = false;
  private genreIds: Map<string, number> | null = null;

  constructor(deps: KodikSyncDeps) {
    this.prisma = deps.prisma;
    this.kodik = deps.kodik;
    this.log = deps.logger;
    this.notifications = deps.notifications;
  }

  /** A full pass when there has never been one (or it's a week old), else a recent one. */
  async runScheduled(): Promise<void> {
    const full = await this.prisma.syncState.findUnique({ where: { key: FULL_KEY } });
    const stale = !full || Date.now() - full.at.getTime() > 7 * 86_400_000;
    await this.run(stale ? "full" : "recent");
  }

  async run(mode: "full" | "recent"): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();
    const totals = { pages: 0, seen: 0, created: 0, filled: 0, skipped: 0 };
    try {
      this.genreIds = await this.loadGenres();
      let cursor: string | undefined;
      for (let page = 0; mode === "full" || page < RECENT_PAGES; page++) {
        const { groups, nextCursor } = await this.kodik.list(
          { types: "anime,anime-serial", sort: "updated_at", order: "desc", limit: PAGE, has_field: "shikimori_id" },
          cursor,
        );
        totals.pages += 1;
        const result = await this.store(groups);
        totals.seen += groups.length;
        totals.created += result.created;
        totals.filled += result.filled;
        totals.skipped += result.skipped;
        if (!nextCursor) break;
        cursor = nextCursor;
        if (totals.pages % 50 === 0) this.log.info({ mode, ...totals }, "kodik catalogue sync progress");
      }
      if (mode === "full") await this.recountGenres();
      const note = JSON.stringify(totals);
      await this.prisma.syncState.upsert({
        where: { key: mode === "full" ? FULL_KEY : RECENT_KEY },
        create: { key: mode === "full" ? FULL_KEY : RECENT_KEY, at: new Date(), note },
        update: { at: new Date(), note },
      });
      this.log.info({ mode, ...totals, seconds: Math.round((Date.now() - startedAt) / 1000) }, "kodik catalogue sync done");
    } catch (error) {
      this.log.warn({ err: error, mode, ...totals }, "kodik catalogue sync stopped");
    } finally {
      this.running = false;
    }
  }

  /** One page of groups into the catalogue. */
  private async store(groups: KodikGroup[]): Promise<{ created: number; filled: number; skipped: number }> {
    const wanted = groups.filter((g) => !this.isHentai(g));
    const skipped = groups.length - wanted.length;
    if (wanted.length === 0) return { created: 0, filled: 0, skipped };
    if (this.notifications) {
      await this.notifications
        .observe(new Map(wanted.map((g) => [g.shikimoriId, latestEpisode(g)])))
        .catch((error) => this.log.warn({ err: error }, "episode marks failed"));
    }
    const ids = wanted.map((g) => g.shikimoriId);
    const existing = await this.prisma.anime.findMany({
      where: { id: { in: ids } },
      select: { id: true, imageUrl: true, titleLocalized: true },
    });
    const byId = new Map(existing.map((a) => [a.id, a]));

    // New titles: whole rows, plus their genre links.
    const fresh = wanted.filter((g) => !byId.has(g.shikimoriId));
    let created = 0;
    if (fresh.length > 0) {
      const rows: AnimeRow[] = fresh.map((g) => this.row(g));
      const result = await this.prisma.anime.createMany({ data: rows as Prisma.AnimeCreateManyInput[], skipDuplicates: true });
      created = result.count;
      const links = fresh.flatMap((g) =>
        this.genresOf(g).map((genreId) => ({ animeId: g.shikimoriId, genreId })),
      );
      if (links.length > 0) await this.prisma.genreOnAnime.createMany({ data: links, skipDuplicates: true });
    }

    // Known titles: only what's missing.
    let filled = 0;
    for (const g of wanted) {
      const row = byId.get(g.shikimoriId);
      if (!row) continue;
      const detail = toAnimeDetail(g);
      const data: Prisma.AnimeUpdateInput = {};
      if (!row.imageUrl && detail.imageUrl) {
        data.imageUrl = detail.imageUrl;
        data.imageLargeUrl = detail.imageLargeUrl;
      }
      if (!row.titleLocalized && detail.titleLocalized) data.titleLocalized = detail.titleLocalized;
      if (Object.keys(data).length > 0) {
        await this.prisma.anime.update({ where: { id: row.id }, data }).catch(() => undefined);
        filled += 1;
      }
    }

    // Every one of them has a player. Existing availability keeps its own
    // check time, so the regular re-check schedule isn't disturbed.
    const values = wanted.map(
      (g) => Prisma.sql`(${g.shikimoriId}, true, ${g.translations.length}, 'kodik', now())`,
    );
    await this.prisma.$executeRaw`
      INSERT INTO "WatchAvailability" ("animeId", "hasPlayer", "sourceCount", "provider", "checkedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("animeId") DO UPDATE SET
        "hasPlayer" = true,
        "sourceCount" = GREATEST("WatchAvailability"."sourceCount", EXCLUDED."sourceCount"),
        "provider" = COALESCE("WatchAvailability"."provider", EXCLUDED."provider")
    `;
    return { created, filled, skipped };
  }

  private row(g: KodikGroup): AnimeRow {
    const detail = toAnimeDetail(g);
    const md = g.primary.material_data ?? {};
    const rating = md.rating_mpaa ? (RATING[md.rating_mpaa.trim().toLowerCase()] ?? md.rating_mpaa) : null;
    return {
      ...toAnimeRow({ ...detail, rating }),
      // Not a full detail sync: the detail warm-up will still fetch this one.
      detailSyncedAt: null,
      // Shikimori votes are not MAL members; leave popularity to the detail sync.
      members: null,
      scoredBy: md.shikimori_votes ?? null,
    };
  }

  private isHentai(g: KodikGroup): boolean {
    const md = g.primary.material_data ?? {};
    const rating = (md.rating_mpaa ?? "").trim().toLowerCase();
    if (rating === "rx") return true;
    const genres = [...(md.anime_genres ?? []), ...(md.all_genres ?? []), ...(md.genres ?? [])];
    return genres.some((name) => NEVER.test(name.trim()));
  }

  /** Our genre ids for this title's genres; names we don't know are left out. */
  private genresOf(g: KodikGroup): number[] {
    const md = g.primary.material_data ?? {};
    const names = md.anime_genres?.length ? md.anime_genres : (md.genres ?? []);
    const ids = new Set<number>();
    for (const name of names) {
      const id = this.genreIds?.get(normalize(name));
      if (id != null) ids.add(id);
    }
    return [...ids];
  }

  private async loadGenres(): Promise<Map<string, number>> {
    const rows = await this.prisma.genre.findMany({ select: { id: true, name: true } });
    return new Map(rows.map((r) => [normalize(r.name), r.id]));
  }

  private async recountGenres(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Genre" g SET "animeCount" = c.n
      FROM (SELECT "genreId", COUNT(*)::int AS n FROM "GenreOnAnime" GROUP BY "genreId") c
      WHERE c."genreId" = g.id
    `;
  }
}

/** Genre names as both sides spell them: case, ё/е, spaces and dashes don't matter. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/[\s\-–—_]/g, "");
}
