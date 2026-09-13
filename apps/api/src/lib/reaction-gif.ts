/**
 * nekos.best reaction gifs — used both for decorative flourishes (the About
 * page, empty states) and as a new account's default avatar. One shared
 * whitelist and fetch path so "same gifs as the About page" is actually true
 * by construction, not by two copies happening to agree.
 */
export const REACTION_CATEGORIES = [
  "happy",
  "dance",
  "wave",
  "confused",
  "shrug",
  "cry",
  "think",
  "smile",
  "highfive",
  "bored",
] as const;
export type ReactionCategory = (typeof REACTION_CATEGORIES)[number];

const NEKOS_UA = "AnimeShadow (https://fiat-legacy.xyz)";

export function isReactionCategory(value: unknown): value is ReactionCategory {
  return (
    typeof value === "string" &&
    (REACTION_CATEGORIES as readonly string[]).includes(value)
  );
}

export function randomReactionCategory(): ReactionCategory {
  return REACTION_CATEGORIES[Math.floor(Math.random() * REACTION_CATEGORIES.length)]!;
}

/**
 * One gif URL — nothing cached or stored here on purpose. The caller decides
 * what to do with the URL (serve it once, or, for a new account's avatar,
 * persist just the string); nekos.best hosts the actual file.
 */
export async function fetchReactionGif(
  category: ReactionCategory,
  timeoutMs = 5000,
): Promise<string | null> {
  try {
    const res = await fetch(`https://nekos.best/api/v2/${category}?amount=1`, {
      headers: { "user-agent": NEKOS_UA, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ url?: string }> };
    return json.results?.[0]?.url ?? null;
  } catch {
    return null;
  }
}
