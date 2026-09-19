/**
 * Forgiving title matching: the same show should be found whether someone
 * types it in Latin or Cyrillic, with the keyboard in the wrong layout, with
 * words run together or split apart, or with a letter or two wrong.
 *
 * Everything — every stored title and every query — is reduced to one
 * comparable "key" first, so most of the forgiveness is plain string
 * containment on those keys. Only when that finds nothing does it fall back
 * to edit distance for typos, which is both slower and less certain.
 */

// Physical key positions: the same key produces EN[i] on a QWERTY layout and
// RU[i] on a ЙЦУКЕН one. Typing "yfheto" with the wrong layout active means
// "наруто".
const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const RU_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю.";

const EN_TO_RU = new Map([...EN_KEYS].map((ch, i) => [ch, RU_KEYS[i] as string]));
const RU_TO_EN = new Map([...RU_KEYS].map((ch, i) => [ch, EN_KEYS[i] as string]));

function swapLayout(text: string, table: Map<string, string>): string {
  let out = "";
  for (const ch of text.toLowerCase()) out += table.get(ch) ?? ch;
  return out;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/**
 * The comparable form of a title or a query. Lowercase, Cyrillic spelled out
 * in Latin, and everything that is not a letter or digit removed — so spaces,
 * hyphens and punctuation stop mattering, which is what makes "shingeki no
 * kyojin" and "shingekinokyojin" the same thing.
 *
 * A few romanisation habits are folded too, on both sides equally: doubled
 * letters ("shippuuden" / "shippuden"), "ou" for a long o ("kyoujin" /
 * "kyojin"), and "kh" for х. Applied symmetrically, these only ever make two
 * spellings of the same name agree; they cannot make different names match.
 */
export function titleKey(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase().normalize("NFKD")) {
    out += TRANSLIT[ch] ?? ch;
  }
  return out
    .replace(/[̀-ͯ]/g, "") // diacritics left over from NFKD
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/kh/g, "h")
    .replace(/ou/g, "o")
    .replace(/(.)\1+/g, "$1");
}

/**
 * The forms a query might really have meant: as typed, and as typed on the
 * other keyboard layout in both directions. Deduplicated, so a query with no
 * letters (a year, say) costs one comparison rather than three.
 */
export function queryVariants(query: string): string[] {
  const variants = [
    titleKey(query),
    titleKey(swapLayout(query, EN_TO_RU)),
    titleKey(swapLayout(query, RU_TO_EN)),
  ];
  return [...new Set(variants.filter((v) => v.length > 0))];
}

export interface TitleRecord {
  id: number;
  members: number | null;
  titles: Array<string | null>;
}

interface IndexedTitle {
  id: number;
  members: number;
  keys: string[];
}

export interface TitleHit {
  id: number;
  /** Higher is better. Exact beats prefix beats contained beats a typo. */
  score: number;
}

/** Scores for each kind of match — the gaps are what keep them ordered. */
const SCORE = { exact: 1000, prefix: 800, contains: 600, fuzzy: 450 } as const;

/** Keys this short match too much by containment to be worth checking that way. */
const MIN_CONTAINS = 2;

/**
 * How many wrong letters a query of a given length may carry and still match.
 * None under four: a three-letter query one letter off is a different word.
 * Scaled with length after that, because one slip in a long title is far
 * less ambiguous than one slip in a short one.
 */
function allowedEdits(length: number): number {
  if (length < 4) return 0;
  if (length <= 6) return 1;
  if (length <= 10) return 2;
  return 3;
}

/**
 * Edit distance from `query` to the best-matching stretch anywhere inside
 * `key` (Sellers' algorithm), counting a swap of two neighbouring letters as
 * one edit rather than two. That last part is the point: "naurto" is one slip
 * from "naruto", not two, and a plain edit distance would reject it.
 *
 * Returns the distance and where the match began, so a hit at the start of a
 * title can outrank the same hit buried in its middle.
 */
function substringDistance(query: string, key: string): { dist: number; start: number } {
  const n = query.length;
  const m = key.length;
  // Row 0 is all zeros: a match may begin anywhere in the key for free.
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = new Array<number>(m + 1).fill(0);
  let cur = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = query[i - 1] === key[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && query[i - 1] === key[j - 2] && query[i - 2] === key[j - 1]) {
        v = Math.min(v, (prev2[j - 2] as number) + 1);
      }
      cur[j] = v;
    }
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  let dist = Number.POSITIVE_INFINITY;
  let end = 0;
  for (let j = 0; j <= m; j++) {
    if ((prev[j] as number) < dist) {
      dist = prev[j] as number;
      end = j;
    }
  }
  return { dist, start: Math.max(0, end - n) };
}

export class FuzzyTitleIndex {
  private readonly items: IndexedTitle[];

  constructor(records: TitleRecord[]) {
    this.items = records.map((r) => ({
      id: r.id,
      members: r.members ?? 0,
      keys: [
        ...new Set(
          r.titles
            .filter((t): t is string => Boolean(t && t.trim()))
            .map(titleKey)
            .filter((k) => k.length > 0),
        ),
      ],
    }));
  }

  get size(): number {
    return this.items.length;
  }

  search(query: string, limit = 30): TitleHit[] {
    const variants = queryVariants(query);
    if (variants.length === 0) return [];

    const best = new Map<number, number>();
    const offer = (id: number, score: number) => {
      if (score > (best.get(id) ?? -1)) best.set(id, score);
    };

    // The certain matches: the query, in any of its forms, is part of a
    // title's key.
    for (const item of this.items) {
      for (const variant of variants) {
        for (const key of item.keys) {
          if (key === variant) offer(item.id, SCORE.exact);
          else if (key.startsWith(variant)) offer(item.id, SCORE.prefix);
          else if (variant.length >= MIN_CONTAINS && key.includes(variant)) {
            offer(item.id, SCORE.contains);
          }
        }
      }
    }

    // Typos only get their turn when nothing certain turned up. Mixing
    // approximate hits in alongside exact ones would push near-misses in
    // between the results someone actually typed.
    if (best.size === 0) {
      for (const variant of variants) {
        const max = allowedEdits(variant.length);
        if (max === 0) continue;
        for (const item of this.items) {
          for (const key of item.keys) {
            // A key too short to hold the query even with every allowed edit
            // spent cannot match; skipping it is most of the saving here.
            if (key.length < variant.length - max) continue;
            const { dist, start } = substringDistance(variant, key);
            if (dist > max) continue;
            // Each slip costs, and a match at the start of a title (the name
            // itself, not a word from its subtitle) is worth a little more.
            // Extra length costs a little too, so a typo of "naruto" finds
            // "Naruto" ahead of its fifteen films and sequels.
            const extra = Math.min(15, Math.floor((key.length - variant.length) / 4));
            offer(item.id, SCORE.fuzzy - dist * 80 + (start <= 1 ? 20 : 0) - Math.max(0, extra));
          }
        }
      }
    }

    const members = new Map(this.items.map((i) => [i.id, i.members]));
    return [...best.entries()]
      .map(([id, score]) => ({ id, score }))
      // Among equally good matches, the better-known show first.
      .sort((a, b) => b.score - a.score || (members.get(b.id) ?? 0) - (members.get(a.id) ?? 0))
      .slice(0, limit);
  }
}
