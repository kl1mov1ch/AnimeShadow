import type { PrismaClient } from "@animeshadow/db";
import { contentGuardWhere } from "../lib/content-guard.js";

export interface AnimeFact {
  id: string;
  /** A short headline — the number or the claim. */
  title: string;
  text: string;
  anime: { id: number; slug: string; title: string; image: string | null } | null;
}

export interface FactsServiceDeps {
  prisma: PrismaClient;
}

/** How many of the best-known titles the facts are drawn from. */
const POOL_TITLES = 4000;
const POOL_TTL_MS = 6 * 60 * 60_000;

const SEASON: Record<string, string> = { WINTER: "зимой", SPRING: "весной", SUMMER: "летом", FALL: "осенью" };
const TYPE: Record<string, string> = {
  TV: "сериал",
  MOVIE: "полнометражный фильм",
  OVA: "OVA",
  ONA: "веб-сериал",
  SPECIAL: "спецвыпуск",
  MUSIC: "музыкальный клип",
};

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** "24 min per ep", "1 hr 45 min", "24 мин." → minutes. */
function minutesOf(duration: string | null): number | null {
  if (!duration) return null;
  const h = /(\d+)\s*(?:hr|h|ч)/i.exec(duration);
  const m = /(\d+)\s*(?:min|мин|m\b)/i.exec(duration);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total > 0 ? total : null;
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/**
 * "Did you know" — facts built from the catalogue itself rather than
 * written by hand: every one of them is true by construction, because it
 * is read straight off the numbers (rank, score and how many rated it, how
 * many keep it in a list, length in hours, studio and year, how it stands
 * among its genre, its year, its studio). Thousands of titles times a
 * dozen patterns is a pool of several thousand; it is rebuilt every six
 * hours and dealt at random.
 */
export class FactsService {
  private readonly prisma: PrismaClient;
  private pool: { at: number; facts: AnimeFact[] } | null = null;
  private building: Promise<AnimeFact[]> | null = null;

  constructor(deps: FactsServiceDeps) {
    this.prisma = deps.prisma;
  }

  async random(count: number): Promise<{ facts: AnimeFact[]; total: number }> {
    const pool = await this.load();
    const picks = new Set<number>();
    const want = Math.min(count, pool.length);
    while (picks.size < want) picks.add(Math.floor(Math.random() * pool.length));
    return { facts: [...picks].map((i) => pool[i]!), total: pool.length };
  }

  private async load(): Promise<AnimeFact[]> {
    if (this.pool && Date.now() - this.pool.at < POOL_TTL_MS) return this.pool.facts;
    this.building ??= this.build()
      .then((facts) => {
        this.pool = { at: Date.now(), facts };
        return facts;
      })
      .finally(() => {
        this.building = null;
      });
    return this.building;
  }

  private async build(): Promise<AnimeFact[]> {
    const rows = await this.prisma.anime.findMany({
      where: { AND: [{ members: { not: null } }, contentGuardWhere(false)] },
      orderBy: { members: "desc" },
      take: POOL_TITLES,
      select: {
        id: true,
        slug: true,
        title: true,
        titleLocalized: true,
        imageUrl: true,
        type: true,
        episodes: true,
        duration: true,
        score: true,
        scoredBy: true,
        rank: true,
        members: true,
        favorites: true,
        year: true,
        season: true,
        studios: true,
        source: true,
        genres: { select: { genre: { select: { name: true } } } },
      },
    });
    const facts: AnimeFact[] = [];
    const total = rows.length;
    const add = (id: string, title: string, text: string, row: (typeof rows)[number] | null) =>
      facts.push({
        id,
        title,
        text,
        anime: row ? { id: row.id, slug: row.slug, title: row.titleLocalized ?? row.title, image: row.imageUrl } : null,
      });

    rows.forEach((row, index) => {
      const name = `«${row.titleLocalized ?? row.title}»`;
      const kind = TYPE[row.type] ?? "тайтл";
      const genres = row.genres.map((g) => g.genre.name).slice(0, 3);
      const minutes = minutesOf(row.duration);

      if (row.rank != null && row.rank <= 1500) {
        add(`rank-${row.id}`, `№${fmt(row.rank)} в мире`, `${name} занимает ${fmt(row.rank)}-е место в мировом рейтинге аниме по оценкам зрителей.`, row);
      }
      if (row.score != null && row.scoredBy != null && row.scoredBy >= 1000) {
        add(`score-${row.id}`, `${row.score.toFixed(2)} из 10`, `Средняя оценка ${name} — ${row.score.toFixed(2)}. Её поставили ${fmt(row.scoredBy)} ${plural(row.scoredBy, "зритель", "зрителя", "зрителей")}.`, row);
      }
      if (row.members != null && row.members >= 10_000) {
        add(`members-${row.id}`, `${fmt(row.members)} в списках`, `${name} добавили в свои списки ${fmt(row.members)} ${plural(row.members, "человек", "человека", "человек")} по всему миру.`, row);
        const percent = Math.round(((total - index) / total) * 100);
        if (percent >= 50 && percent < 100) {
          add(`share-${row.id}`, `Популярнее ${percent}%`, `${name} популярнее, чем ${percent}% из ${fmt(total)} известных тайтлов нашего каталога.`, row);
        }
      }
      if (row.favorites != null && row.favorites >= 1000) {
        add(`fav-${row.id}`, `${fmt(row.favorites)} любимых`, `${fmt(row.favorites)} ${plural(row.favorites, "зритель отметил", "зрителя отметили", "зрителей отметили")} ${name} как одно из самых любимых аниме.`, row);
      }
      if (row.type === "TV" && row.episodes && minutes) {
        const hours = Math.round((row.episodes * minutes) / 60);
        if (hours >= 2) {
          add(`hours-${row.id}`, `≈ ${fmt(hours)} ч просмотра`, `Чтобы посмотреть ${name} целиком (${fmt(row.episodes)} ${plural(row.episodes, "серия", "серии", "серий")} по ~${minutes} мин), понадобится около ${fmt(hours)} ${plural(hours, "часа", "часов", "часов")}${hours >= 48 ? ` — это больше ${Math.floor(hours / 24)} суток без сна` : ""}.`, row);
        }
      }
      if (row.type === "MOVIE" && minutes && minutes >= 40) {
        add(`movie-${row.id}`, `${minutes} минут`, `${name} — полнометражный фильм длиной ${minutes} ${plural(minutes, "минута", "минуты", "минут")}.`, row);
      }
      if (row.studios[0] && row.year) {
        add(`studio-${row.id}`, row.studios[0], `${name} (${kind}, ${row.year}) снимала студия ${row.studios.join(" и ")}.`, row);
      }
      if (row.season && row.year && SEASON[row.season]) {
        add(`season-${row.id}`, `${row.year}`, `Премьера ${name} состоялась ${SEASON[row.season]} ${row.year} года.`, row);
      }
      if (genres.length >= 2) {
        add(`genres-${row.id}`, genres.join(" · "), `${name} сочетает сразу несколько жанров: ${genres.slice(0, -1).join(", ")} и ${genres.at(-1)}.`, row);
      }
      if (row.source && row.source !== "Original" && row.source !== "Unknown") {
        add(`source-${row.id}`, "Первоисточник", `${name} — экранизация: первоисточник этого ${kind === "сериал" ? "сериала" : "тайтла"} — ${sourceRu(row.source)}.`, row);
      }
      if (row.type === "TV" && row.episodes && row.episodes >= 100 && row.year) {
        add(`long-${row.id}`, `${fmt(row.episodes)} серий`, `${name} выходит с ${row.year} года и насчитывает ${fmt(row.episodes)} ${plural(row.episodes, "серию", "серии", "серий")}.`, row);
      }
    });

    // Aggregates: the best of a year, of a genre, of a studio.
    const bestBy = <K extends string | number>(key: (r: (typeof rows)[number]) => K[] | K | null) => {
      const map = new Map<K, { count: number; best: (typeof rows)[number] }>();
      for (const r of rows) {
        const keys = key(r);
        for (const k of Array.isArray(keys) ? keys : keys == null ? [] : [keys]) {
          const cur = map.get(k);
          if (!cur) map.set(k, { count: 1, best: r });
          else {
            cur.count++;
            if ((r.score ?? 0) > (cur.best.score ?? 0)) cur.best = r;
          }
        }
      }
      return map;
    };
    for (const [year, { count, best }] of bestBy((r) => r.year)) {
      if (count >= 5 && best.score) {
        add(`year-${year}`, `Лучшее ${year} года`, `Из ${count} заметных аниме ${year} года выше всех зрители оценили «${best.titleLocalized ?? best.title}» — ${best.score.toFixed(2)}.`, best);
      }
    }
    for (const [genre, { count, best }] of bestBy((r) => r.genres.map((g) => g.genre.name))) {
      if (count >= 10 && best.score) {
        add(`genre-${genre}`, genre, `Самое высоко оценённое аниме в жанре «${genre}» среди ${fmt(count)} известных тайтлов — «${best.titleLocalized ?? best.title}» (${best.score.toFixed(2)}).`, best);
      }
    }
    for (const [studio, { count, best }] of bestBy((r) => r.studios)) {
      if (count >= 4 && best.score) {
        add(`studioTop-${studio}`, studio, `Студия ${studio} выпустила ${count} ${plural(count, "заметный тайтл", "заметных тайтла", "заметных тайтлов")}; лучший по оценкам — «${best.titleLocalized ?? best.title}».`, best);
      }
    }
    return facts;
  }
}

function sourceRu(source: string): string {
  const map: Record<string, string> = {
    Manga: "манга",
    "Light novel": "лайт-новелла",
    Novel: "роман",
    "Web manga": "веб-манга",
    "Web novel": "веб-новелла",
    "Visual novel": "визуальная новелла",
    Game: "видеоигра",
    "4-koma manga": "ёнкома-манга",
    "Card game": "карточная игра",
    Music: "музыка",
    Book: "книга",
    "Picture book": "книжка с картинками",
  };
  return map[source] ?? source.toLowerCase();
}
