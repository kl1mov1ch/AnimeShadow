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
