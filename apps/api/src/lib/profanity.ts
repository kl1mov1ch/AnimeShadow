import BadWordsNext from "bad-words-next";
import en from "bad-words-next/lib/en";
import ru from "bad-words-next/lib/ru";

const filter = new BadWordsNext();
filter.add(en);
filter.add(ru);

/** Checks Russian + English profanity (real Cyrillic dictionary, not transliteration). */
export function isProfane(text: string): boolean {
  return filter.check(text);
}
