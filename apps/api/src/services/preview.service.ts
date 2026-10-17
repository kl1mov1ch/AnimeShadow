import { AnimeThemesClient } from "@animeshadow/animethemes";

export interface DirectPreview {
  url: string;
  kind: "opening" | "ending";
  source: "AnimeThemes";
  pageUrl: string | null;
}

/** Exact MAL matches only. The client never receives an arbitrary scraped video URL. */
export class PreviewService {
  private cache = new Map<number, { until: number; value: DirectPreview | null }>();
  private pending = new Map<number, Promise<DirectPreview | null>>();
  constructor(private client = new AnimeThemesClient()) {}

  get(id: number): Promise<DirectPreview | null> {
    const cached = this.cache.get(id);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
    const running = this.pending.get(id);
    if (running) return running;
    if (this.pending.size >= 16) return Promise.resolve(null);
    const task = this.load(id).finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }

  private async load(id: number): Promise<DirectPreview | null> {
    const themes = await this.client.getThemes(id).catch(() => null);
    const track = themes?.tracks.find((t) => {
      try {
        const url = new URL(t.url);
        return url.protocol === "https:" && url.hostname === "v.animethemes.moe" && url.pathname.endsWith(".webm");
      } catch { return false; }
    });
    const value: DirectPreview | null = track ? { url: track.url, kind: track.kind === "OP" ? "opening" : "ending", source: "AnimeThemes", pageUrl: track.pageUrl } : null;
    if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, { until: Date.now() + (value ? 86_400_000 : 600_000), value });
    return value;
  }
}
