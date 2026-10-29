import type { PrismaClient } from "@animeshadow/db";
import { type DubStudio, isStudioName, studioSlug } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";

/** Under this many titles a name is more likely a provider's typo than a studio. */
export const STUDIO_MIN_TITLES = 3;

export interface DubStudioIndex {
  list: DubStudio[];
  /** slug → every spelling providers use for that studio, commonest first. */
  names: Map<string, string[]>;
}

// Which studios voice what changes when providers sync — every half hour is plenty.
const cache = new TtlCache<DubStudioIndex>(30 * 60_000, 1);

/**
 * Every dub studio the site can play, worked out from the player sources:
 * one row per studio however providers spell it ("AniLibria.TV" and
 * "AniLibria" are one), with a few of its best-known posters. Shared by the
 * studios API, the sitemap and the server-rendered pages.
 */
export function dubStudios(prisma: PrismaClient): Promise<DubStudioIndex> {
  return cache.wrap("all", async () => {
    const rows = await prisma.playerSource.groupBy({
      by: ["title"],
      where: { kind: { not: "subtitles" }, anime: contentGuardWhere(false) },
      _count: { animeId: true },
    });
    const bySlug = new Map<string, { names: Map<string, number>; count: number }>();
    for (const row of rows) {
      const name = row.title.trim();
      if (!isStudioName(name)) continue;
      const slug = studioSlug(name);
      const entry = bySlug.get(slug) ?? { names: new Map(), count: 0 };
      entry.names.set(name, (entry.names.get(name) ?? 0) + row._count.animeId);
      entry.count += row._count.animeId;
      bySlug.set(slug, entry);
    }
    // Posters for the cards: the best-known titles, one query for all studios.
    const known = await prisma.anime.findMany({
      where: { AND: [contentGuardWhere(false), { imageUrl: { not: null } }, { playerSources: { some: { kind: { not: "subtitles" } } } }] },
      select: { imageUrl: true, playerSources: { where: { kind: { not: "subtitles" } }, select: { title: true } } },
      orderBy: { members: { sort: "desc", nulls: "last" } },
      take: 1500,
    });
    const posters = new Map<string, string[]>();
    for (const anime of known) {
      for (const slug of new Set(anime.playerSources.map((source) => studioSlug(source.title)))) {
        const list = posters.get(slug) ?? [];
        if (list.length < 4 && anime.imageUrl) list.push(anime.imageUrl);
        posters.set(slug, list);
      }
    }
    const names = new Map<string, string[]>();
    const list: DubStudio[] = [];
    for (const [slug, entry] of bySlug) {
      const variants = [...entry.names.entries()].sort((a, b) => b[1] - a[1]);
      names.set(slug, variants.map(([name]) => name));
      list.push({ slug, name: variants[0]![0], count: entry.count, posters: posters.get(slug) ?? [] });
    }
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
    return { list, names };
  });
}
