import { ANIME_WITH_GENRES_INCLUDE, type Prisma, type PrismaClient, toSummaryDto } from "@animeshadow/db";
import type { CuratedCollection, CuratedCollectionDetail } from "@animeshadow/shared";
import { landingPath, seasonNameRu, seasonOf, shiftSeason } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";

export interface CuratedServiceDeps {
  prisma: PrismaClient;
}

interface Rule {
  slug: string;
  icon: CuratedCollection["icon"];
  title: (ctx: Ctx) => string;
  pitch: string;
  where: (ctx: Ctx) => Prisma.AnimeWhereInput;
  orderBy: Prisma.AnimeOrderByWithRelationInput[];
  /** The same list in the catalogue (or a landing page), to go further. */
  more: (ctx: Ctx) => string;
  /** Not offered as the collection of the day. */
  noDaily?: boolean;
}

interface Ctx {
  genre: (name: string) => number | undefined;
  season: { year: number; season: ReturnType<typeof seasonOf>["season"] };
}

const byScore: Prisma.AnimeOrderByWithRelationInput[] = [{ score: { sort: "desc", nulls: "last" } }, { members: { sort: "desc", nulls: "last" } }];
const byMembers: Prisma.AnimeOrderByWithRelationInput[] = [{ members: { sort: "desc", nulls: "last" } }];
const inGenres = (ctx: Ctx, ...names: string[]): Prisma.AnimeWhereInput => {
  const ids = names.map((n) => ctx.genre(n)).filter((id): id is number => id != null);
  return ids.length ? { genres: { some: { genreId: { in: ids } } } } : { id: -1 };
};
const genreHref = (ctx: Ctx, name: string, extra = "") => {
  const id = ctx.genre(name);
  return id != null ? `/browse?genres=${id}${extra}` : "/browse";
};

/**
 * Themed lists the site keeps itself — "for one evening", "short and
 * strong", the season's best, the classics… Each is a rule over the
 * catalogue, so it is never empty and keeps up with the catalogue by itself,
 * and only titles that can be played here make it in: every card opens on
 * something to watch. They sit above the viewers' own collections, which
 * were the whole page before — and a page of two or three of those, on a
 * site this young, gave nobody a reason to look.
 */
const RULES: Rule[] = [
  {
    slug: "one-evening",
    icon: "film",
    title: () => "На один вечер",
    pitch: "Полнометражные фильмы с высокой оценкой — начать и закончить сегодня.",
    where: () => ({ type: "MOVIE", score: { gte: 7.8 } }),
    orderBy: byScore,
    more: () => "/browse?type=MOVIE&orderBy=score&minScore=7.5",
  },
  {
    slug: "short-and-strong",
    icon: "timer",
    title: () => "Короткие и сильные",
    pitch: "Сериалы до 13 серий, которым хватило одного сезона, чтобы зацепить.",
    where: () => ({ type: "TV", episodes: { gte: 2, lte: 13 }, score: { gte: 8 } }),
    orderBy: byScore,
    more: () => "/browse?type=TV&episodesMin=2&episodesMax=13&minScore=8&orderBy=score",
  },
  {
    slug: "season-best",
    icon: "calendar",
    title: (ctx) => `Лучшее ${seasonNameRu(ctx.season.season, "gen")} ${ctx.season.year}`,
    pitch: "Самое заметное из того, что выходит в этом сезоне.",
    where: (ctx) => ({ year: ctx.season.year, season: ctx.season.season }),
    orderBy: byMembers,
    more: (ctx) => landingPath({ kind: "season", ...ctx.season }),
  },
  {
    slug: "start-here",
    icon: "compass",
    title: () => "С чего начать",
    pitch: "Самые любимые тайтлы — если вы только знакомитесь с аниме.",
    where: () => ({ score: { gte: 8.2 } }),
    orderBy: byMembers,
    more: () => "/browse?orderBy=popularity&minScore=8",
  },
  {
    slug: "airing-now",
    icon: "radio",
    title: () => "Выходят прямо сейчас",
    pitch: "Новые серии каждую неделю — самые популярные онгоинги.",
    where: () => ({ airing: "AIRING" }),
    orderBy: byMembers,
    more: () => "/ongoing",
    noDaily: true,
  },
  {
    slug: "classics",
    icon: "trophy",
    title: () => "Классика, которую стоит знать",
    pitch: "До 2006 года — то, на чём выросли поколения зрителей.",
    where: () => ({ year: { lte: 2006 }, score: { gte: 8 } }),
    orderBy: byScore,
    more: () => "/browse?yearTo=2006&minScore=8&orderBy=score",
  },
  {
    slug: "cozy",
    icon: "coffee",
    title: () => "Уютные повседневки",
    pitch: "Спокойные истории без спешки — для вечера под пледом.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Повседневность"), { score: { gte: 7.5 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Повседневность", "&orderBy=score"),
  },
  {
    slug: "mind-games",
    icon: "brain",
    title: () => "Психологические триллеры",
    pitch: "Игры разума, неожиданные повороты и герои на грани.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Психологическое", "Триллер"), { score: { gte: 7.8 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Психологическое", "&orderBy=score"),
  },
  {
    slug: "laugh",
    icon: "smile",
    title: () => "Смеяться до слёз",
    pitch: "Комедии, которые зрители оценили выше всего.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Комедия"), { score: { gte: 8 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Комедия", "&orderBy=score"),
  },
  {
    slug: "romance",
    icon: "heart",
    title: () => "Про любовь",
    pitch: "Романтика — от первой влюблённости до взрослых историй.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Романтика"), { score: { gte: 7.9 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Романтика", "&orderBy=score"),
  },
  {
    slug: "sport",
    icon: "flame",
    title: () => "Спорт и азарт",
    pitch: "Команды, тренировки и матчи, от которых не оторваться.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Спорт"), { score: { gte: 7.5 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Спорт", "&orderBy=score"),
  },
  {
    slug: "mecha-space",
    icon: "rocket",
    title: () => "Меха и космос",
    pitch: "Огромные роботы, звёздные флоты и далёкие миры.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Меха", "Космос"), { score: { gte: 7.6 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Меха", "&orderBy=score"),
  },
  {
    slug: "chills",
    icon: "ghost",
    title: () => "Мурашки по коже",
    pitch: "Ужасы и мистика — смотреть со светом.",
    where: (ctx) => ({ AND: [inGenres(ctx, "Ужасы"), { score: { gte: 7.2 } }] }),
    orderBy: byScore,
    more: (ctx) => genreHref(ctx, "Ужасы", "&orderBy=score"),
  },
  {
    slug: "no-ads",
    icon: "monitor",
    title: () => "Наш плеер, без рекламы",
    pitch: "Тайтлы, которые играют в нашем собственном плеере — до 1080p.",
    where: () => ({ watchAvailability: { hasCustomPlayer: true } }),
    orderBy: byMembers,
    more: () => "/browse?hasCustomPlayer=1",
    noDaily: true,
  },
];

/** How many titles a collection's page shows (the rest is in the catalogue). */
const PAGE_SIZE = 48;

export class CuratedService {
  private readonly prisma: PrismaClient;
  /** Recomputed every few hours: the catalogue changes slowly. */
  private readonly cache = new TtlCache<unknown>(3 * 60 * 60_000, 64);

  constructor(deps: CuratedServiceDeps) {
    this.prisma = deps.prisma;
  }

  private async ctx(): Promise<Ctx> {
    const genres = await this.prisma.genre.findMany({ select: { id: true, name: true } });
    const byName = new Map(genres.map((g) => [g.name.toLowerCase(), g.id]));
    return {
      genre: (name) => byName.get(name.toLowerCase()),
      season: seasonOf(new Date()),
    };
  }

  /** Only titles that play here, have a picture and a score, and pass the
   *  age gate for this viewer. */
  private base(rule: Rule, ctx: Ctx, allowAdult: boolean): Prisma.AnimeWhereInput {
    return {
      AND: [
        rule.where(ctx),
        { watchAvailability: { hasPlayer: true } },
        { imageUrl: { not: null } },
        contentGuardWhere(allowAdult),
      ],
    };
  }

  async list(allowAdult: boolean): Promise<{ daily: string | null; items: CuratedCollection[] }> {
    return this.cache.wrap(`list:${allowAdult}`, async () => {
      const ctx = await this.ctx();
      // This season may only just have started: fall back to the last one.
      if ((await this.prisma.anime.count({ where: this.base(RULES[2]!, ctx, allowAdult) })) < 8) {
        ctx.season = shiftSeason(ctx.season, -1);
      }
      const items = (
        await Promise.all(
          RULES.map(async (rule): Promise<CuratedCollection | null> => {
            const where = this.base(rule, ctx, allowAdult);
            const [total, covers] = await Promise.all([
              this.prisma.anime.count({ where }),
              this.prisma.anime.findMany({ where, orderBy: rule.orderBy, take: 6, include: ANIME_WITH_GENRES_INCLUDE }),
            ]);
            if (total < 4) return null;
            return {
              slug: rule.slug,
              icon: rule.icon,
              title: rule.title(ctx),
              pitch: rule.pitch,
              total,
              covers: covers.map(toSummaryDto),
            };
          }),
        )
      ).filter((item): item is CuratedCollection => item != null);
      // The collection of the day: the same for everyone all day, a
      // different one tomorrow.
      const candidates = items.filter((item) => !RULES.find((r) => r.slug === item.slug)?.noDaily);
      const day = Math.floor(Date.now() / 86_400_000);
      const daily = candidates.length ? candidates[day % candidates.length]!.slug : null;
      return { daily, items };
    }) as Promise<{ daily: string | null; items: CuratedCollection[] }>;
  }

  async detail(slug: string, allowAdult: boolean): Promise<CuratedCollectionDetail> {
    const rule = RULES.find((r) => r.slug === slug);
    if (!rule) throw new NotFoundError("Такой подборки нет");
    return this.cache.wrap(`detail:${slug}:${allowAdult}`, async () => {
      const ctx = await this.ctx();
      if (rule.slug === "season-best" && (await this.prisma.anime.count({ where: this.base(rule, ctx, allowAdult) })) < 8) {
        ctx.season = shiftSeason(ctx.season, -1);
      }
      const where = this.base(rule, ctx, allowAdult);
      const [total, rows] = await Promise.all([
        this.prisma.anime.count({ where }),
        this.prisma.anime.findMany({ where, orderBy: rule.orderBy, take: PAGE_SIZE, include: ANIME_WITH_GENRES_INCLUDE }),
      ]);
      return {
        slug: rule.slug,
        icon: rule.icon,
        title: rule.title(ctx),
        pitch: rule.pitch,
        total,
        items: rows.map(toSummaryDto),
        moreHref: rule.more(ctx),
        others: RULES.filter((r) => r.slug !== rule.slug)
          .slice(0, 6)
          .map((r) => ({ slug: r.slug, title: r.title(ctx), icon: r.icon })),
      };
    }) as Promise<CuratedCollectionDetail>;
  }
}
