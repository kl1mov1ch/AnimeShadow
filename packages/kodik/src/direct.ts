import type { WatchSource } from "@animeshadow/shared";

/**
 * The seam for a direct (non-iframe) Kodik source.
 *
 * ## Why this file exists and returns nothing
 *
 * The brief was: play Kodik's video in our own player instead of theirs, but
 * only through what Kodik officially permits, and never by bypassing ads,
 * DRM, authorisation or any other restriction. Both halves of that were
 * checked against the live API with this project's own token:
 *
 * - `/search` answers with 24 fields. The only two that point at media are
 *   `link` — an embed *page* on `kodikplayer.com` — and `worldart_link`, an
 *   encyclopedia entry. There is no manifest field, no mp4 field, no
 *   quality-to-URL map.
 * - `/search?with_episodes_data=true` goes one level deeper and gives
 *   `seasons[n].episodes[m] = { link, screenshots }`. `link` is again an
 *   embed page (`//kodikplayer.com/seria/…/720p`), `screenshots` are plain
 *   JPEGs on `i.kodikres.com`.
 *
 * So the official API exposes exactly one way to play a Kodik title: their
 * embed page. Any direct stream would have to be taken out of that page's
 * runtime — which is precisely the bypass the brief rules out, and which
 * would also strip the advertising the provider is paid by. We therefore
 * keep the iframe and stop here, deliberately.
 *
 * ## What this file is for
 *
 * Kodik does sell a licensed integration. If that access ever arrives, this
 * is the only place that has to change: implement {@link KodikDirectSource}
 * inside {@link resolveDirectSources} and every layer above it — the watch
 * service, the API response, the player — already handles a `format: "hls"`
 * source, because AniLibria is served that way today. Nothing else in the
 * codebase needs to learn a new shape.
 *
 * The contract is intentionally narrow: an episode identity in, zero or more
 * fully-described playable sources out. No HTML, no scraping hooks, no
 * "just try this URL" escape.
 */

/** Which episode of which title is wanted. Whatever access we are granted, this is all it may need. */
export interface KodikEpisodeRef {
  /** Kodik's own id for the title, as returned by `/search` (`id`, e.g. "serial-10015"). */
  kodikId: string;
  /** Kodik's translation (dub) id — the same value that becomes a `WatchSource.id`. */
  translationId: string;
  /** 1-based episode number, counted across seasons the way this project counts them. */
  episode: number;
}

/**
 * One playable stream, described completely enough to hand straight to a
 * player: what it is, how good it is, and anything the request needs.
 */
export interface KodikDirectSource {
  /** Container/transport. Only what our own player already speaks. */
  format: "hls" | "mp4";
  /** Absolute, ready-to-play URL. */
  url: string;
  /** "1080p" / "720p" / … as the provider labels it, when it says. */
  quality: string | null;
  /**
   * Headers the stream needs (Referer, a signed token header, …). Whatever
   * a licensed integration requires goes here rather than being hardcoded
   * at the call site — and it stays server-side: the API only ever sends
   * the frontend a URL it can already fetch.
   */
  headers?: Record<string, string>;
  /** Seconds, when the provider states it — lets the UI show a length before play. */
  durationSeconds?: number;
}

export interface KodikDirectOptions {
  /**
   * The credential a licensed direct-source integration would be issued.
   * Read from the server environment by the caller; never sent to the
   * browser, and without it this adapter does not even try.
   */
  accessToken?: string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * Ask Kodik for playable streams for one episode.
 *
 * Returns `[]` today, always, because — as documented above — the public API
 * grants no such stream on permitted terms. It is a real function rather
 * than a `TODO` so that callers can be written, typechecked and shipped now,
 * and so that turning the feature on later is a change to one function body.
 */
export async function resolveDirectSources(
  _ref: KodikEpisodeRef,
  options: KodikDirectOptions = {},
): Promise<KodikDirectSource[]> {
  if (!options.accessToken) return [];
  // Access granted but unimplemented: fail loudly rather than silently
  // serving an iframe that someone believes is a direct stream.
  throw new Error(
    "Kodik direct-source access is configured but no licensed endpoint is implemented yet — " +
      "implement resolveDirectSources() against the terms of that licence.",
  );
}

/**
 * Fold direct streams into the source the rest of the app already has.
 *
 * With nothing to fold in, the iframe source is returned untouched — which
 * is the documented fallback: "if a direct source is unavailable on
 * permitted terms, keep the iframe".
 */
export function withDirectSources(
  source: WatchSource,
  direct: KodikDirectSource[],
): WatchSource {
  const hls = direct.filter((d) => d.format === "hls");
  if (hls.length === 0) return source;
  return {
    ...source,
    format: "hls",
    quality: hls[0]?.quality ?? source.quality,
  };
}
