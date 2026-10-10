import type { AnimeSummary } from "./anime.js";
import type { AnimeSeason } from "./enums.js";

/**
 * Landing pages: one clean URL per thing people search for — "топ аниме",
 * "онгоинги", "аниме осени 2026", "аниме 2025 года", "аниме в жанре
 * романтика" — instead of a catalogue URL with a query string. The same
 * definitions drive the page in the app and the HTML the server sends to
 * search engines, so both always say the same thing.
 */
export const LANDING_KINDS = ["top", "popular", "ongoing", "announced", "movies", "season", "year", "genre"] as const;
export type LandingKind = (typeof LANDING_KINDS)[number];

export interface LandingParams {
  kind: LandingKind;
  year?: number;
  season?: AnimeSeason;
  /** Genre slug, e.g. "slice-of-life". */
  genre?: string;
  page?: number;
}

export interface LandingLink {
  href: string;
  label: string;
}

/** What the page says about itself. */
export interface LandingCopy {
  /** <title> */
  title: string;
  h1: string;
  /** meta description */
  description: string;
  /** The paragraph under the heading. */
  intro: string;
}

export interface LandingPage {
  params: LandingParams;
  copy: LandingCopy;
  items: AnimeSummary[];
  page: number;
  perPage: number;
  total: number;
  /** Neighbouring landings — other seasons, years, genres — for moving on. */
  related: LandingLink[];
}

export const LANDING_PER_PAGE = 36;

const SEASON_SLUGS: AnimeSeason[] = ["winter", "spring", "summer", "fall"];
const SEASON_NOM: Record<AnimeSeason, string> = { winter: "зима", spring: "весна", summer: "лето", fall: "осень" };
const SEASON_GEN: Record<AnimeSeason, string> = { winter: "зимы", spring: "весны", summer: "лета", fall: "осени" };

export function seasonNameRu(season: AnimeSeason, form: "nom" | "gen" = "nom"): string {
  return (form === "gen" ? SEASON_GEN : SEASON_NOM)[season];
}

/** The season a date falls in (Jan–Mar winter, Apr–Jun spring, …). */
export function seasonOf(date: Date): { year: number; season: AnimeSeason } {
  return { year: date.getUTCFullYear(), season: SEASON_SLUGS[Math.floor(date.getUTCMonth() / 3)]! };
}

export function shiftSeason(at: { year: number; season: AnimeSeason }, by: number): { year: number; season: AnimeSeason } {
  const index = at.year * 4 + SEASON_SLUGS.indexOf(at.season) + by;
  return { year: Math.floor(index / 4), season: SEASON_SLUGS[((index % 4) + 4) % 4]! };
}

export function landingPath(p: LandingParams): string {
  const base =
    p.kind === "season"
      ? `/season/${p.year}/${p.season}`
      : p.kind === "year"
        ? `/year/${p.year}`
        : p.kind === "genre"
          ? `/genre/${p.genre}`
          : `/${p.kind}`;
  return p.page && p.page > 1 ? `${base}?page=${p.page}` : base;
}

/** The landing a path is, or null. `/genre/<slug>`, `/season/2026/fall`… */
export function parseLandingPath(pathname: string, search = ""): LandingParams | null {
  // No URLSearchParams here: this package also builds without DOM types.
  const pageMatch = /(?:^|[?&])page=(\d+)/.exec(search);
  const page = Math.max(1, Math.min(500, Number(pageMatch?.[1]) || 1));
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [head, a, b] = parts;
  if (parts.length === 1 && head && (["top", "popular", "ongoing", "announced", "movies"] as string[]).includes(head)) {
    return { kind: head as LandingKind, page };
  }
  if (head === "year" && parts.length === 2 && /^\d{4}$/.test(a ?? "")) {
    const year = Number(a);
    if (year >= 1917 && year <= 2100) return { kind: "year", year, page };
  }
  if (head === "season" && parts.length === 3 && /^\d{4}$/.test(a ?? "") && SEASON_SLUGS.includes(b as AnimeSeason)) {
    return { kind: "season", year: Number(a), season: b as AnimeSeason, page };
  }
  if (head === "genre" && parts.length === 2 && /^[a-z0-9-]{2,60}$/.test(a ?? "")) {
    return { kind: "genre", genre: a, page };
  }
  return null;
}

/** Titles, headings and texts, in Russian. `genreName` is the genre's Russian name. */
export function landingCopy(p: LandingParams, genreName?: string): LandingCopy {
  const pageNote = p.page && p.page > 1 ? ` — страница ${p.page}` : "";
  const brand = " | AnimeShadow";
  switch (p.kind) {
    case "top":
      return {
        title: `Топ аниме всех времён — лучшие аниме по рейтингу${pageNote}${brand}`,
        h1: "Топ аниме всех времён",
        description:
          "Лучшие аниме всех времён по оценкам зрителей: рейтинг, жанры, год выхода и число серий. Выберите, что посмотреть, и смотрите онлайн бесплатно.",
        intro:
          "Рейтинг собран по оценкам сотен тысяч зрителей: в списке только тайтлы с большим числом голосов, чтобы случайные высокие оценки не перекашивали топ.",
      };
    case "popular":
      return {
        title: `Популярные аниме — что сейчас смотрят все${pageNote}${brand}`,
        h1: "Самые популярные аниме",
        description:
          "Самые популярные аниме: тайтлы, которые добавили в свои списки больше всего зрителей. Смотрите популярные аниме онлайн бесплатно.",
        intro: "Порядок — по тому, сколько людей добавили тайтл в свой список: это то, что смотрят и обсуждают больше всего.",
      };
    case "ongoing":
      return {
        title: `Онгоинги — аниме, которые выходят сейчас${pageNote}${brand}`,
        h1: "Онгоинги: аниме, которые выходят сейчас",
        description:
          "Все онгоинги: аниме, которые выходят прямо сейчас, с новыми сериями каждую неделю. Даты новых серий, озвучки и рейтинг — смотрите онлайн.",
        intro: "Здесь всё, что выходит прямо сейчас: новые серии появляются каждую неделю. Самые ожидаемые — сверху.",
      };
    case "announced":
      return {
        title: `Анонсы аниме — что скоро выйдет${pageNote}${brand}`,
        h1: "Анонсированные аниме",
        description: "Аниме, которые скоро выйдут: анонсы новых сериалов и фильмов, даты премьер. Добавьте в список, чтобы не пропустить.",
        intro: "Тайтлы, которые объявлены, но ещё не вышли. Добавьте в «Мой список», чтобы не пропустить премьеру.",
      };
    case "movies":
      return {
        title: `Аниме-фильмы — лучшие полнометражные аниме${pageNote}${brand}`,
        h1: "Аниме-фильмы",
        description:
          "Лучшие аниме-фильмы: полнометражные аниме с рейтингом, описанием и годом выхода. Смотрите аниме-фильмы онлайн бесплатно.",
        intro: "Полнометражные аниме — от классики до новых премьер, по популярности.",
      };
    case "season": {
      const name = seasonNameRu(p.season!, "gen");
      return {
        title: `Аниме ${name} ${p.year} — список всех аниме сезона${pageNote}${brand}`,
        h1: `Аниме ${name} ${p.year}`,
        description: `Все аниме ${name} ${p.year} года: список сезона, рейтинги, жанры и озвучки. Смотрите аниме сезона «${seasonNameRu(p.season!)} ${p.year}» онлайн бесплатно.`,
        intro: `Все тайтлы, премьера которых пришлась на сезон «${seasonNameRu(p.season!)} ${p.year}», — сначала самые популярные.`,
      };
    }
    case "year":
      return {
        title: `Аниме ${p.year} года — лучшие аниме года${pageNote}${brand}`,
        h1: `Аниме ${p.year} года`,
        description: `Все аниме ${p.year} года: сериалы и фильмы, рейтинги и жанры. Смотрите лучшие аниме ${p.year} года онлайн бесплатно.`,
        intro: `Сериалы, фильмы и OVA, вышедшие в ${p.year} году, — по популярности.`,
      };
    case "genre": {
      const name = genreName ?? p.genre ?? "";
      return {
        title: `Аниме в жанре «${name}» — смотреть онлайн${pageNote}${brand}`,
        h1: `Аниме в жанре «${name}»`,
        description: `Лучшие аниме в жанре «${name}»: список с рейтингом, годом выхода и описанием. Смотрите аниме жанра «${name}» онлайн бесплатно.`,
        intro: `Все аниме в жанре «${name}» — сначала самые популярные. Сузить выбор можно в каталоге.`,
      };
    }
  }
}
