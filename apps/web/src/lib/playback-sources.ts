import type { WatchSource } from "@animeshadow/shared";

/** A direct source must name the requested episode explicitly. */
export function hasEpisode(source: WatchSource, episode: number): boolean {
  if (source.format === "hls") return Boolean(source.hlsEpisodes?.[String(episode)]);
  if (source.format === "mp4") return Boolean(source.mediaEpisodes?.[String(episode)]);
  const episodes = source.iframeEpisodes;
  if (episodes && Object.keys(episodes).length > 0)
    return Boolean(episodes[String(episode)]);
  return source.episodesCount == null || episode <= source.episodesCount;
}

/** Keep quality and encode labels in the quality menu, not the studio name. */
export function dubName(title: string): string {
  return title.replace(/\s*[[(](?:(?:360|480|720|1080|1440|2160)p?|full\s*hd|hd|[24]k|web[- ]?dl|b[dr]rip)[\])]/gi, "")
    .replace(/(?:\s*[·|—-]\s*|\s+)(?:(?:360|480|720|1080|1440|2160)p|full\s*hd|hd|[24]k|web[- ]?dl|b[dr]rip)\b/gi, "").trim() || title;
}

export function sourcesForEpisode(
  sources: WatchSource[],
  episode: number,
): WatchSource[] {
  return sources.filter((source) => hasEpisode(source, episode));
}

/** Resume after a retry/source change even within the opening or closing minute. */
export function resumePosition(
  seconds: number,
  duration: number,
  exact: boolean,
): number | null {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return null;
  if (exact) return Math.min(seconds, Math.max(0, duration - 0.1));
  return seconds >= 30 && seconds <= duration - 60 ? seconds : null;
}

/** Qualities from our simple Kodik master for Safari's native HLS player. */
export function nativeVariantsFromMaster(
  text: string,
  base: string,
): Record<string, string> {
  const variants: Record<string, string> = {};
  let height: string | undefined;
  for (const line of text.split(/\r?\n/).map((value) => value.trim())) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      height = /RESOLUTION=\d+x(\d+)/i.exec(line)?.[1];
    } else if (line && !line.startsWith("#") && height) {
      const url = new URL(line, base);
      if (url.protocol === "https:" || url.origin === new URL(base).origin)
        variants[height] = url.href;
      height = undefined;
    }
  }
  return variants;
}
