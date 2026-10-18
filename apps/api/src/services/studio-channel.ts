import { TtlCache } from "../lib/cache.js";

/** RSS link published in the official @honkonstudio channel's document head. */
export const HONKON_CHANNEL = "UCKPtzE-QBrgzmIhR9eCiY3w";
export interface ChannelVideo {
  id: string;
  youtubeId: string;
  title: string;
  image: string;
  sourceUrl: string;
}
const decode = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export function parseStudioFeed(xml: string): ChannelVideo[] {
  if (
    !xml.includes(`<yt:channelId>${HONKON_CHANNEL}</yt:channelId>`) ||
    xml.length > 1_000_000
  )
    throw new Error("Unexpected studio channel feed");
  const videos = new Map<string, ChannelVideo>();
  for (const match of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1]!;
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<(?:media:)?title(?:\s[^>]*)?>([\s\S]*?)<\/(?:media:)?title>/.exec(
      entry,
    )?.[1];
    if (!id || !title) continue;
    videos.set(id, {
      id: `youtube:${id}`,
      youtubeId: id,
      title: decode(title).slice(0, 300),
      image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    });
    if (videos.size >= 30) break;
  }
  return [...videos.values()];
}

/** Public RSS only; no account access, API key, scraping of video files or ads. */
export class StudioChannel {
  private cache = new TtlCache<ChannelVideo[]>(10 * 60_000, 1);
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getVideos(): Promise<ChannelVideo[]> {
    return this.cache.wrap("hon-kon", async () => {
      const response = await this.fetchImpl(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${HONKON_CHANNEL}`,
        {
          signal: AbortSignal.timeout(10_000),
          headers: { accept: "application/atom+xml, application/xml" },
        },
      );
      if (!response.ok) throw new Error(`Studio channel HTTP ${response.status}`);
      return parseStudioFeed(await response.text());
    });
  }
}
