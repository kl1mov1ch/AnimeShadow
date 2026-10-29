/** Stable provider identity, shared by previews and room source restrictions. */
export type StudioId = "hon-kon";

export function isHonKonSource(source: { id: string; title: string }): boolean {
  return (
    source.id === "kodik:4167" ||
    /^hon[\s-]*kon(?:\s+studio)?$/i.test(source.title.trim())
  );
}

export function sourceBelongsToStudio(
  source: { id: string; title: string },
  studio?: StudioId | null,
): boolean {
  return !studio || isHonKonSource(source);
}

/** A dub studio's name as it appears across providers, e.g. "AniLibria.TV". */
export interface DubStudio {
  slug: string;
  name: string;
  /** Titles this studio voiced that the site can play. */
  count: number;
  /** A few of its best-known titles' posters, for the studio card. */
  posters: string[];
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** One address per studio: "AniLibria.TV" and "Anilibria" both land on /studios/anilibria. */
export function studioSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => CYRILLIC[ch] ?? "")
    .replace(/\.(?:tv|ru|com|net|org)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Not studios: what some providers put where the studio's name goes. */
export function isStudioName(name: string): boolean {
  return Boolean(studioSlug(name)) && !/субтитр|subtitle|оригинал|original|unknown|неизвест|многоголос|одноголос|двухголос|^озвучка$|^dub$/i.test(name.trim());
}
