// AnimeThemes (https://animethemes.moe) — a public, tokenless API over an
// archive of anime openings and endings, indexed by, among other things, the
// MyAnimeList id this project already keys on.
//
// What makes it usable as motion on a page, where a trailer is not: the
// entries are creditless ("nc"), so there is no title card or staff roll
// burned into the picture, they are short, and they are built to loop. The
// files are plain .webm served with range support, so a <video> element
// streams the few seconds actually watched rather than the whole 30MB.

export interface AnimeThemesClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  /** Overridable, but see the note on DEFAULTS.userAgent before removing it. */
  userAgent?: string;
}

export interface AnimeOpening {
  /** Direct .webm URL. */
  url: string;
  /** Separate audio-only track (.ogg), when the archive has one. */
  audioUrl: string | null;
  /** Song title, when the archive knows it. */
  song: string | null;
  /** Artist(s) credited for the song. */
  artist: string | null;
  /** "OP1", "OP2", … — which opening this is. */
  slug: string;
  /** Vertical resolution, e.g. 1080 or 576. */
  resolution: number | null;
  /** Bytes of the video. Worth knowing before deciding to autoplay one. */
  size: number | null;
  /** The archive's own page for this theme. */
  pageUrl: string | null;
}

/** A title's opening and ending, whichever of the two the archive has. */
export interface AnimeThemes {
  opening: AnimeOpening | null;
  ending: AnimeOpening | null;
}

interface RawAudio {
  link?: string;
}

interface RawVideo {
  link?: string;
  resolution?: number | null;
  size?: number | null;
  nc?: boolean;
  subbed?: boolean;
  lyrics?: boolean;
  overlap?: string | null;
  audio?: RawAudio | null;
}

interface RawEntry {
  spoiler?: boolean;
  videos?: RawVideo[];
}

interface RawTheme {
  type?: string;
  sequence?: number | null;
  slug?: string;
  song?: { title?: string; artists?: Array<{ name?: string }> } | null;
  animethemeentries?: RawEntry[];
}

interface RawAnime {
  name?: string;
  slug?: string;
  animethemes?: RawTheme[];
}

const DEFAULTS = {
  baseUrl: "https://api.animethemes.moe",
  timeoutMs: 8_000,
  minIntervalMs: 700,
  // Not optional. Left to Node's own default, the edge in front of
  // AnimeThemes answers with an HTML challenge page instead of JSON, which
  // parses as a failure and makes every lookup return null — the feature
  // would look like "the archive has nothing for any title" rather than like
  // a blocked request.
  userAgent: "AnimeShadow (https://fiat-legacy.xyz)",
};

export class AnimeThemesClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly userAgent: string;

  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: AnimeThemesClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.userAgent = options.userAgent ?? DEFAULTS.userAgent;
  }

  /**
   * The opening worth playing for a title, or null when the archive has none.
   *
   * "Worth playing" is a real filter, not just the first row: an entry marked
   * as a spoiler has no business appearing under a title someone has not
   * watched yet, a subtitled or lyric-burned copy has text baked into the
   * picture, and a version with credits shows a staff roll over the footage.
   */
  /** The opening and the ending together — one request serves both. */
  async getThemes(malId: number): Promise<AnimeThemes> {
    const params = new URLSearchParams({
      "filter[has]": "resources",
      "filter[site]": "MyAnimeList",
      "filter[external_id]": String(malId),
      include:
        "animethemes.animethemeentries.videos.audio,animethemes.song.artists",
    });

    const data = await this.request<{ anime?: RawAnime[] }>(
      `/anime?${params.toString()}`,
    );
    const anime = data?.anime?.[0];
    const themes = anime?.animethemes ?? [];

    return {
      opening: pickTheme(themes, "OP", anime?.slug),
      ending: pickTheme(themes, "ED", anime?.slug),
    };
  }

  /** Just the opening — what the background-motion callers want. */
  async getOpening(malId: number): Promise<AnimeOpening | null> {
    return (await this.getThemes(malId)).opening;
  }

  // -- internals ---------------------------------------------------------

  /** Serialised with a minimum gap, the same way the AniList client is —
   *  this is called from page loads, and bursting a public API is rude. */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private request<T>(path: string): Promise<T | null> {
    return this.schedule(async () => {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: {
            accept: "application/json",
            "user-agent": this.userAgent,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as T | null;
      } catch {
        // Decoration. Never a reason to fail the page that asked.
        return null;
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The best usable entry of a given kind, or null.
 *
 * "Usable" is a real filter, not just the first row: an entry marked as a
 * spoiler has no business appearing under a title someone has not watched
 * yet, a subtitled or lyric-burned copy has text baked into the picture, and
 * a version with credits shows a staff roll over the footage.
 */
function pickTheme(
  themes: RawTheme[],
  kind: "OP" | "ED",
  animeSlug: string | undefined,
): AnimeOpening | null {
  const ordered = themes
    .filter((t) => (t.type ?? "").toUpperCase() === kind)
    .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99));

  for (const theme of ordered) {
    for (const entry of theme.animethemeentries ?? []) {
      if (entry.spoiler) continue;
      const video = (entry.videos ?? [])
        .filter((v) => v.link && !v.subbed && !v.lyrics)
        // Creditless first, then the sharpest copy available.
        .sort((a, b) => {
          if (a.nc !== b.nc) return a.nc ? -1 : 1;
          return (b.resolution ?? 0) - (a.resolution ?? 0);
        })[0];
      if (!video?.link) continue;
      const slug = theme.slug ?? `${kind}${theme.sequence ?? 1}`;
      const artists = (theme.song?.artists ?? [])
        .map((a) => a.name)
        .filter((n): n is string => Boolean(n));
      return {
        url: video.link,
        audioUrl: video.audio?.link ?? null,
        song: theme.song?.title ?? null,
        artist: artists.length > 0 ? artists.join(", ") : null,
        slug,
        resolution: video.resolution ?? null,
        size: video.size ?? null,
        // The archive's own page for the title, so anything beyond listening
        // is its call to offer, not ours to route around.
        pageUrl: animeSlug ? `https://animethemes.moe/anime/${animeSlug}` : null,
      };
    }
  }
  return null;
}
