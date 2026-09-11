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

/**
 * Shikimori editors tag genuinely-interesting trivia (backstory reveals,
 * little-known details) inside `[spoiler]...[/spoiler]` — pull those out as
 * distinct "facts" instead of leaving them flattened into one wall of text.
 * Must run on the *raw* markup before `stripShikimoriMarkup`, which only
 * strips the tag itself and leaves the spoiler's text in place.
 */
export function splitCharacterFacts(
  input: string | null | undefined,
): { bio: string | null; facts: string[] } {
  if (!input) return { bio: null, facts: [] };

  const facts: string[] = [];
  const bioRaw = input.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner: string) => {
    // A spoiler block can itself contain several sentences — keep it as one
    // fact if short, otherwise split on sentence boundaries.
    const cleaned = stripShikimoriMarkup(inner)?.trim();
    if (!cleaned) return "";
    for (const part of cleaned.split(/(?<=[.!?])\s+(?=[А-ЯA-Z])/)) {
      const trimmed = part.trim();
      if (trimmed) facts.push(trimmed);
    }
    return "";
  });

  return { bio: stripShikimoriMarkup(bioRaw), facts };
}
