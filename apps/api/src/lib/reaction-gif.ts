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
  "pout",
  "pat",
  "hug",
  "blush",
  "thumbsup",
] as const;
export type ReactionCategory = (typeof REACTION_CATEGORIES)[number];

const NEKOS_UA = "AnimeShadow (https://animeshadow.online)";

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

/**
 * A pool of gif URLs per category, kept in memory: one request to
 * nekos.best fills it with 20 at once, and every page after is answered
 * from here in no time. Refilled after six hours; while a refill is under
 * way (or nekos.best is down) the old pool keeps answering. Before, every
 * gif on every page was a live request with a five-second timeout — on a
 * slow or blocked connection that held the whole page up.
 */
const POOL_TTL_MS = 6 * 60 * 60_000;
const pools = new Map<ReactionCategory, { urls: string[]; at: number }>();
const filling = new Map<ReactionCategory, Promise<void>>();

function fill(category: ReactionCategory): Promise<void> {
  const running = filling.get(category);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch(`https://nekos.best/api/v2/${category}?amount=20`, {
        headers: { "user-agent": NEKOS_UA, accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { results?: Array<{ url?: string }> };
      const urls = (json.results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u));
      if (urls.length > 0) pools.set(category, { urls, at: Date.now() });
    } catch {
      // Keep whatever pool there was.
    } finally {
      filling.delete(category);
    }
  })();
  filling.set(category, job);
  return job;
}

/** A gif from the pool — waits for nekos.best only the very first time. */
export async function pooledReactionGif(category: ReactionCategory): Promise<string | null> {
  const pool = pools.get(category);
  if (pool && Date.now() - pool.at > POOL_TTL_MS) void fill(category);
  if (!pool) await fill(category);
  const urls = pools.get(category)?.urls;
  return urls && urls.length > 0 ? urls[Math.floor(Math.random() * urls.length)]! : null;
}
