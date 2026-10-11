import type { AnimeAiring, AnimeType } from "@animeshadow/shared";

/**
 * What a search query asks for besides its words: a year or a decade, a
 * format, whether it is still airing, and "like that one".
 *
 * People type "фильмы 2020", "онгоинги романтика", "аниме 90-х", "похоже на
 * Наруто" — this takes those parts out so the words that are left are
 * searched as words, and the rest becomes a filter. Anything it doesn't
 * recognise stays in the query untouched.
 */
export interface ParsedQuery {
  rest: string;
  yearFrom: number | null;
  yearTo: number | null;
  type: AnimeType | null;
  airing: AnimeAiring | null;
  /** The text after "похоже на" / "like", when the query is that. */
  similar: string | null;
}

const TYPE_WORDS: Array<[RegExp, AnimeType]> = [
  [/^(фильм|фильмы|фильмов|полнометраж\S*|кино|movies?|film)$/, "MOVIE"],
  [/^(сериал|сериалы|сериалов|тв|tv)$/, "TV"],
  [/^(ова|ovа|ova|oav)$/, "OVA"],
  [/^(она|ona|веб)$/, "ONA"],
  [/^(спешл|спешлы|special|specials)$/, "SPECIAL"],
];

const AIRING_WORDS: Array<[RegExp, AnimeAiring]> = [
  [/^(онгоинг|онгоинги|онгоингов|выходит|выходящие|выходящее|airing|ongoing)$/, "AIRING"],
  [/^(анонс|анонсы|анонсов|скоро|announced|upcoming)$/, "UPCOMING"],
  [/^(вышедшие|вышедшее|завершённые|завершенные|законченные|finished|completed)$/, "FINISHED"],
];

/** Words that only say "anime" and add nothing to a search on an anime site. */
const FILLER = /^(аниме|anime|года|год|г|за|в|про|с|из|of|the)$/;

const SIMILAR = /^(?:похож(?:ее|ие|ий|ая|е)?(?:\s+на)?|как|типа|вроде|наподобие|в\s+духе|like|similar\s+to)\s+(.+)$/i;

const MIN_YEAR = 1960;

export function parseQuery(raw: string, now = new Date()): ParsedQuery {
  const out: ParsedQuery = { rest: raw.trim(), yearFrom: null, yearTo: null, type: null, airing: null, similar: null };
  const similar = SIMILAR.exec(out.rest);
  if (similar?.[1] && similar[1].trim().length >= 2) {
    out.similar = similar[1].trim();
    out.rest = "";
    return out;
  }

  const maxYear = now.getFullYear() + 2;
  const kept: string[] = [];
  const words = out.rest.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const lower = word.toLowerCase().replace(/[.,!?]+$/, "");

    // A decade: "90-х", "2010-е", "2000х", "нулевые".
    const decade = /^(\d{2}|\d{4})-?(?:х|е|x|s|ых|ые)$/.exec(lower);
    if (decade && out.yearFrom == null) {
      let start = Number(decade[1]);
      if (start < 100) start += start >= 60 ? 1900 : 2000;
      if (start % 10 === 0 && start >= MIN_YEAR && start <= maxYear) {
        out.yearFrom = start;
        out.yearTo = start + 9;
        continue;
      }
    }
    if (lower === "нулевые" || lower === "нулевых") {
      out.yearFrom = 2000;
      out.yearTo = 2009;
      continue;
    }
    // A year, or a span of them: "2020", "2015-2020".
    const span = /^(\d{4})(?:-|–|—|\.\.)(\d{4})$/.exec(lower);
    if (span) {
      const a = Number(span[1]);
      const b = Number(span[2]);
      if (a >= MIN_YEAR && b <= maxYear && a <= b) {
        out.yearFrom = a;
        out.yearTo = b;
        continue;
      }
    }
    if (/^\d{4}$/.test(lower)) {
      const year = Number(lower);
      // Only a lone year counts: in "2001 Nights" or a title that is a
      // number, the number is the name.
      if (year >= MIN_YEAR && year <= maxYear && words.length > 1 && out.yearFrom == null) {
        out.yearFrom = year;
        out.yearTo = year;
        continue;
      }
    }
    const type = TYPE_WORDS.find(([re]) => re.test(lower));
    if (type && out.type == null && words.length > 1) {
      out.type = type[1];
      continue;
    }
    const airing = AIRING_WORDS.find(([re]) => re.test(lower));
    if (airing && out.airing == null) {
      out.airing = airing[1];
      continue;
    }
    // A lone format word is a whole query: "фильмы" → every film.
    if (type && words.length === 1) {
      out.type = type[1];
      continue;
    }
    kept.push(word);
  }
  const hasFilter = out.yearFrom != null || out.type != null || out.airing != null;
  out.rest = (hasFilter ? kept.filter((w) => !FILLER.test(w.toLowerCase())) : kept).join(" ");
  return out;
}

export function hasFilters(parsed: ParsedQuery): boolean {
  return parsed.yearFrom != null || parsed.type != null || parsed.airing != null;
}

/** Whether a title fits the filters read from the query. */
export function fitsFilters(
  parsed: ParsedQuery,
  anime: { year: number | null; type: AnimeType; airing: AnimeAiring },
): boolean {
  if (parsed.type && anime.type !== parsed.type) return false;
  if (parsed.airing && anime.airing !== parsed.airing) return false;
  if (parsed.yearFrom != null) {
    if (anime.year == null || anime.year < parsed.yearFrom || anime.year > (parsed.yearTo ?? parsed.yearFrom)) return false;
  }
  return true;
}
