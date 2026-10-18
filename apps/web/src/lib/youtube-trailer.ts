/** Accept actual YouTube video links, never arbitrary iframe origins. */
export function youtubeTrailer(value: string | null | undefined): { embed: string; watch: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"].includes(host) || url.protocol !== "https:") return null;
    const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? /^\/(?:embed|shorts|v)\/([^/]+)/.exec(url.pathname)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, watch: `https://www.youtube.com/watch?v=${id}` };
  } catch { return null; }
}
