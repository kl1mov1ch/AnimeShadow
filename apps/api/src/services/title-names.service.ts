import type { PrismaClient } from "@animeshadow/db";
import type { ShikimoriClient } from "@animeshadow/shikimori";

export interface TitleNamesServiceDeps {
  prisma: PrismaClient;
  shikimori: ShikimoriClient;
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}

/** Titles per GraphQL request — the API's own ceiling. */
const BATCH = 50;
/** Names change rarely: a title is read again after this long. */
const RECHECK_MS = 60 * 24 * 60 * 60_000;

/**
 * Every other name a title goes by, for search: "Вторжение гигантов" and
 * "AoT" find Attack on Titan, "JJK" finds Jujutsu Kaisen.
 *
 * Shikimori keeps them (synonyms, the licensed Russian name, the English
 * and Japanese ones) but only its GraphQL API hands them out, fifty titles
 * a request. Each pass reads the titles never read before — the best-known
 * first — then those not read for two months, a few thousand at most, on
 * the Shikimori client's background lane so visitors' requests go first.
 * The search index picks the names up on its next rebuild.
 */
export class TitleNamesService {
  private readonly prisma: PrismaClient;
  private readonly shikimori: ShikimoriClient;
  private readonly logger: TitleNamesServiceDeps["logger"];
  private running = false;

  constructor(deps: TitleNamesServiceDeps) {
    this.prisma = deps.prisma;
    this.shikimori = deps.shikimori;
    this.logger = deps.logger;
  }

  async run(limit = 3000): Promise<void> {
    if (this.running) return;
    this.running = true;
    let read = 0;
    let named = 0;
    try {
      const stale = new Date(Date.now() - RECHECK_MS);
      const targets = await this.prisma.anime.findMany({
        where: { OR: [{ namesSyncedAt: null }, { namesSyncedAt: { lt: stale } }] },
        // How many people rated it is the one measure of fame every row has.
        orderBy: [{ namesSyncedAt: { sort: "asc", nulls: "first" } }, { scoredBy: { sort: "desc", nulls: "last" } }],
        take: limit,
        select: { id: true, title: true, titleEnglish: true, titleJapanese: true, titleLocalized: true },
      });
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        let found;
        try {
          found = await this.shikimori.animeNames(batch.map((t) => t.id));
        } catch (error) {
          this.logger.warn({ error }, "title names: Shikimori request failed");
          break;
        }
        const byId = new Map(found.map((f) => [f.id, f]));
        const now = new Date();
        await this.prisma.$transaction(
          batch.map((row) => {
            const names = byId.get(row.id);
            const own = new Set(
              [row.title, row.titleEnglish, row.titleJapanese, row.titleLocalized]
                .filter((n): n is string => Boolean(n))
                .map((n) => n.trim().toLowerCase()),
            );
            const synonyms = names
              ? [...new Set([...names.synonyms, names.licenseNameRu, names.english, names.japanese])]
                  .filter((n): n is string => typeof n === "string" && n.trim().length > 1 && n.length <= 200)
                  .map((n) => n.trim())
                  .filter((n) => !own.has(n.toLowerCase()))
                  .slice(0, 20)
              : [];
            if (synonyms.length > 0) named += 1;
            return this.prisma.anime.update({
              where: { id: row.id },
              data: { titleSynonyms: synonyms, namesSyncedAt: now },
              select: { id: true },
            });
          }),
        );
        read += batch.length;
        // Gentle on Shikimori: its GraphQL API answers 429 to a quick run of requests.
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (read > 0) this.logger.info({ read, named }, "title names synced");
    } catch (error) {
      this.logger.warn({ error, read }, "title names sync failed");
    } finally {
      this.running = false;
    }
  }
}
