/** Prefer a real localized name to a number-only label or English provider metadata. */
export function preferredEpisodeTitle(current: string | null, incoming: string | null, locale: string): string | null {
  const generic = (value: string) => /^(?:(?:серия|эпизод|episode|ep\.?)[\s:#-]*\d+|\d+\s*(?:серия|эпизод))[.!]?$/i.test(value.trim());
  if (!incoming || generic(incoming)) return current;
  if (!current || generic(current)) return incoming;
  if (locale === "ru" && !/[а-яё]/i.test(current) && /[а-яё]/i.test(incoming)) return incoming;
  return current;
}
