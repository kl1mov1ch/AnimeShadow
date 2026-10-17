import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { REACTION_CATEGORIES, type ReactionCategory } from "./reaction-gif.js";

/**
 * The site's own little library of reaction gifs: a few per category,
 * downloaded once from nekos.best, stored as 384 px animated WebP (a
 * 160 KB gif becomes about 20 KB) and kept on disk. The browser gets one
 * small manifest and then files that never change — cached for a year, so
 * from the second page on a gif is on screen instantly.
 */

const PER_CATEGORY = 6;
const UA = "AnimeShadow (https://animeshadow.online)";
/** Rebuilt (new gifs added, the oldest beyond the limit kept) weekly. */
const REFRESH_MS = 7 * 24 * 60 * 60_000;

export class GifLibrary {
  private manifest = new Map<ReactionCategory, string[]>();
  private building: Promise<void> | null = null;
  private builtAt = 0;

  constructor(private readonly dir: string) {}

  /** category → file names. Empty until the first build finishes. */
  list(): Record<string, string[]> {
    return Object.fromEntries(this.manifest);
  }

  async file(name: string): Promise<Buffer | null> {
    if (!/^[a-z]+-[0-9a-f]{12}\.webp$/.test(name)) return null;
    return readFile(join(this.dir, name)).catch(() => null);
  }

  private stills = new Map<string, Buffer>();

  /**
   * The gif's first frame, still and a few KB: a picker of forty shows at
   * once on a slow phone, the moving picture fading in over it after.
   */
  async still(name: string): Promise<Buffer | null> {
    const hit = this.stills.get(name);
    if (hit) return hit;
    const buf = await this.file(name);
    if (!buf) return null;
    const out = await sharp(buf).webp({ quality: 82 }).toBuffer().catch(() => null);
    if (!out) return null;
    if (this.stills.size >= 800) this.stills.delete(this.stills.keys().next().value!);
    this.stills.set(name, out);
    return out;
  }

  /** What is on disk already — answers right after a restart. */
  async load(): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const found = new Map<ReactionCategory, Array<{ name: string; at: number }>>();
    for (const name of names) {
      const m = /^([a-z]+)-[0-9a-f]{12}\.webp$/.exec(name);
      if (!m || !(REACTION_CATEGORIES as readonly string[]).includes(m[1]!)) continue;
      const info = await stat(join(this.dir, name)).catch(() => null);
      if (!info) continue;
      const cat = m[1] as ReactionCategory;
      found.set(cat, [...(found.get(cat) ?? []), { name, at: info.mtimeMs }]);
    }
    for (const [cat, files] of found) {
      this.manifest.set(cat, files.sort((a, b) => b.at - a.at).slice(0, PER_CATEGORY).map((f) => f.name));
    }
  }

  /** Fills every category that has fewer than its share; quietly skips failures. */
  build(): Promise<void> {
    if (this.building) return this.building;
    if (Date.now() - this.builtAt < REFRESH_MS && this.complete()) return Promise.resolve();
    this.building = (async () => {
      await mkdir(this.dir, { recursive: true });
      for (const cat of REACTION_CATEGORIES) {
        const have = this.manifest.get(cat) ?? [];
        if (have.length >= PER_CATEGORY && Date.now() - this.builtAt < REFRESH_MS) continue;
        const urls = await this.urls(cat);
        const made: string[] = [];
        for (const url of urls) {
          if (made.length + have.length >= PER_CATEGORY * 2) break;
          // Include encoding version: immutable browser caches keep old URLs forever.
          const name = `${cat}-${createHash("sha1").update(`hq2:${url}`).digest("hex").slice(0, 12)}.webp`;
          if (have.includes(name) || made.includes(name)) continue;
          const ok = await this.convert(url, join(this.dir, name));
          if (ok) made.push(name);
        }
        this.manifest.set(cat, [...made, ...have].slice(0, PER_CATEGORY));
      }
      this.builtAt = Date.now();
    })().finally(() => {
      this.building = null;
    });
    return this.building;
  }

  private complete(): boolean {
    return REACTION_CATEGORIES.every((c) => (this.manifest.get(c)?.length ?? 0) >= PER_CATEGORY);
  }

  private async urls(cat: ReactionCategory): Promise<string[]> {
    try {
      const res = await fetch(`https://nekos.best/api/v2/${cat}?amount=${PER_CATEGORY + 4}`, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: Array<{ url?: string }> };
      return (json.results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u));
    } catch {
      return [];
    }
  }

  private async convert(url: string, path: string): Promise<boolean> {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) return false;
      const out = await sharp(buf, { animated: true, limitInputPixels: 64_000_000 })
        .resize({ width: 384, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      await writeFile(path, out);
      return true;
    } catch {
      return false;
    }
  }
}
