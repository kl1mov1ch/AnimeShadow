/**
 * Shikimori descriptions use a BBCode-ish markup with `[[wiki links]]`,
 * `[character=..]name[/character]`, `[b]`, `[spoiler]` etc. Reduce it to plain
 * text (keeps inner labels, drops the tags and furigana-in-brackets).
 */
export function stripShikimoriMarkup(input: string | null | undefined): string | null {
  if (!input) return null;
  let text = input;

  text = text.replace(/\[\[[a-z]+=\d+\]\]([^[]*?)\[\[\/[a-z]+\]\]/gi, "$1");
  text = text.replace(/\[[a-z]+=[^\]]+\]([^[]*?)\[\/[a-z]+\]/gi, "$1");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(
    /\[\/?(?:b|i|u|s|url|spoiler|quote|div|right|center|list|\*)[^\]]*\]/gi,
    "",
  );
  text = text.replace(/\s*\[[぀-ヿ㐀-鿿ｦ-ﾟ]+\]/gu, "");
  text = text.replace(/\s*\[[^\]A-Za-zА-Яа-я0-9]{1,20}\]/gu, "");
  text = text.replace(/\[\/?[a-z][^\]]*\]/gi, "");
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  return text.trim() || null;
}

/** Editors write both `[spoiler]` and `[spoiler=label]`. */
const SPOILER = /\[spoiler(?:=[^\]]*)?\]([\s\S]*?)\[\/spoiler\]/gi;

/** Roughly two or three sentences — long enough to read as a fact, short enough to scan. */
const FACT_TARGET_LENGTH = 220;

/** A spoiler block can hold a whole paragraph — regroup its sentences into a few readable facts. */
function spoilerToFacts(inner: string): string[] {
  const cleaned = stripShikimoriMarkup(inner)?.trim();
  if (!cleaned) return [];
  const facts: string[] = [];
  let current = "";
  for (const sentence of cleaned.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/)) {
    const part = sentence.trim();
    if (!part) continue;
    current = current ? `${current} ${part}` : part;
    if (current.length >= FACT_TARGET_LENGTH) {
      facts.push(current);
      current = "";
    }
  }
  if (current) facts.push(current);
  return facts;
}

/**
 * Shikimori editors tag genuinely-interesting trivia (backstory reveals,
 * little-known details) inside spoiler blocks — pull those out as distinct
 * "facts" instead of leaving them flattened into one wall of text. Must run
 * on the *raw* markup, before `stripShikimoriMarkup`.
 */
export function splitCharacterFacts(
  input: string | null | undefined,
): { bio: string | null; facts: string[] } {
  if (!input) return { bio: null, facts: [] };
  const facts: string[] = [];
  const bioRaw = input.replace(SPOILER, (_, inner: string) => {
    facts.push(...spoilerToFacts(inner));
    return "";
  });
  return { bio: stripShikimoriMarkup(bioRaw), facts };
}

/**
 * The whole description, structured: spoiler trivia as `facts`, each
 * `[h3]Heading[/h3]` block (Внешность, История, Характер…) as its own titled
 * section, and whatever precedes the first heading as the intro.
 */
export function parseCharacterDescription(input: string | null | undefined): {
  intro: string | null;
  sections: Array<{ title: string; body: string }>;
  facts: string[];
} {
  if (!input) return { intro: null, sections: [], facts: [] };

  const facts: string[] = [];
  const withoutSpoilers = input.replace(SPOILER, (_, inner: string) => {
    facts.push(...spoilerToFacts(inner));
    return "";
  });

  // A capturing split yields [intro, title1, body1, title2, body2, …].
  const parts = withoutSpoilers.split(/\[h3\]([\s\S]*?)\[\/h3\]/i);
  const sections: Array<{ title: string; body: string }> = [];
  for (let i = 1; i < parts.length; i += 2) {
    const title = stripShikimoriMarkup(parts[i]);
    const body = stripShikimoriMarkup(parts[i + 1]);
    if (title && body) sections.push({ title, body });
  }

  return { intro: stripShikimoriMarkup(parts[0]), sections, facts };
}
