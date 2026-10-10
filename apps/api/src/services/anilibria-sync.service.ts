import { Prisma, type PrismaClient } from "@animeshadow/db";
import type { AniLibriaClient } from "@animeshadow/anilibria";
import type { FastifyBaseLogger } from "fastify";
import { inBackground } from "../lib/priority.js";
import type { CatalogService } from "./catalog.service.js";

export interface AnilibriaSyncDeps {
  prisma: PrismaClient;
  anilibria: AniLibriaClient;
  catalog: CatalogService;
  logger: FastifyBaseLogger;
}

const KEY = "anilibria-full";
/** The catalogue is read whole at most this often. */
const EVERY_MS = 20 * 60 * 60_000;
/** Titles AniLibria has that we don't list yet, fetched in full per pass. */
const NEW_PER_PASS = 120;
const PAGE = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AniLibria's whole catalogue, matched to ours — the site's own player for
 * every title it has.
 *
 * AniLibria is the one source with a public API that hands out the video
 * itself: per-episode HLS streams in 480p, 720p and 1080p, which our player
 * plays with its own controls, quality menu included. Until now a title
 * only found its AniLibria release when somebody opened it (a search by
 * name, then an id check), so most of the catalogue never showed the own
 * player at all. This reads the catalogue listing — every release carries
 * its MyAnimeList id, the same numbering as ours — and records, per title,
 * which release it is. The watch service then fetches that release directly
 * and the title opens in our player.
 *
 * Blocked releases (by copyright or region) are left out; titles that
 * disappear from AniLibria lose the mark on the next pass.
 */
export class AnilibriaCatalogSync {
  private readonly prisma: PrismaClient;
  private readonly anilibria: AniLibriaClient;
  private readonly catalog: CatalogService;
  private readonly log: FastifyBaseLogger;
  private running = false;

  constructor(deps: AnilibriaSyncDeps) {
    this.prisma = deps.prisma;
    this.anilibria = deps.anilibria;
    this.catalog = deps.catalog;
    this.log = deps.logger;
  }

  async runScheduled(): Promise<void> {
    const last = await this.prisma.syncState.findUnique({ where: { key: KEY } });
    if (last && Date.now() - last.at.getTime() < EVERY_MS) return;
    await this.run();
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();
    try {
      // malId → AniLibria release id. Several releases of one title (a
      // re-release, a recap) collapse onto the newest — listed first.
      const releases = new Map<number, number>();
      let blocked = 0;
      let unmatched = 0;
      for (let page = 1, pages = 1; page <= pages; page++) {
        const { entries, totalPages } = await this.anilibria.listCatalog(page, PAGE);
        pages = totalPages;
        for (const entry of entries) {
          if (entry.blocked) blocked += 1;
          else if (entry.malId == null) unmatched += 1;
          else if (!releases.has(entry.malId)) releases.set(entry.malId, entry.id);
        }
        await sleep(250);
      }
      if (releases.size === 0) throw new Error("AniLibria catalogue came back empty");

      const ids = [...releases.keys()];
      const known = new Set(
        (await this.prisma.anime.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
      );

      // Titles we don't list yet come in whole, through the same detail
      // fetch a title page uses — a few per pass, behind visitors' requests.
      let added = 0;
      for (const id of ids.filter((id) => !known.has(id)).slice(0, NEW_PER_PASS)) {
        const detail = await inBackground(() => this.catalog.getAnimeById(id)).catch(() => null);
        if (detail && (await this.prisma.anime.count({ where: { id } })) > 0) {
          known.add(id);
          added += 1;
        }
      }

      const marked = ids.filter((id) => known.has(id));
      for (let i = 0; i < marked.length; i += 500) {
        const values = marked
          .slice(i, i + 500)
          .map((id) => Prisma.sql`(${id}, ${releases.get(id)!}, true, true, 'anilibria', now())`);
        await this.prisma.$executeRaw`
          INSERT INTO "WatchAvailability" ("animeId", "anilibriaId", "hasPlayer", "hasCustomPlayer", "provider", "checkedAt")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("animeId") DO UPDATE SET
            "anilibriaId" = EXCLUDED."anilibriaId",
            "hasPlayer" = true,
            "hasCustomPlayer" = true
        `;
      }
      // Gone from AniLibria, or blocked since: no release to fetch any more.
      const cleared = await this.prisma.$executeRaw`
        UPDATE "WatchAvailability" SET "anilibriaId" = NULL
        WHERE "anilibriaId" IS NOT NULL AND NOT ("animeId" = ANY(${marked}::int[]))
      `;

      const note = JSON.stringify({ releases: releases.size, marked: marked.length, added, blocked, unmatched, cleared });
      await this.prisma.syncState.upsert({
        where: { key: KEY },
        create: { key: KEY, at: new Date(), note },
        update: { at: new Date(), note },
      });
      this.log.info(
        { releases: releases.size, marked: marked.length, added, blocked, unmatched, cleared, seconds: Math.round((Date.now() - startedAt) / 1000) },
        "anilibria catalogue sync done",
      );
    } catch (error) {
      this.log.warn({ err: error }, "anilibria catalogue sync stopped");
    } finally {
      this.running = false;
    }
  }
}
