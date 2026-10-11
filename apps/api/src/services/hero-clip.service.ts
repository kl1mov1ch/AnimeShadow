import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { setPriority } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@animeshadow/db";
import type { HeroClips } from "@animeshadow/shared";

export interface HeroClipServiceDeps {
  prisma: PrismaClient;
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  /** The titles in the homepage hero right now, in order. */
  spotlightIds: () => Promise<number[]>;
  dir: string;
  ffmpeg: string;
}

/** Seconds of video per clip. The hero changes slide every eight. */
const CLIP_SECONDS = 10;
/** Where in episode 1 the clip starts when the opening's end isn't known. */
const FALLBACK_START = 150;
/** How long one ffmpeg run may take before it is stopped. */
const RUN_TIMEOUT_MS = 180_000;

/**
 * The two sizes made of every clip: a computer's wide hero and a phone's.
 * H.264 in MP4 plays everywhere, Safari on an iPhone included; CRF 27 with
 * the "slow" preset and the film tuning keeps the picture clean at about a
 * megabyte for ten seconds at 720p, a third of that at 432p. No sound (the
 * hero plays muted), and `faststart` so it starts before it has all loaded.
 */
const RENDITIONS = [
  { name: "hd", height: 720, crf: 27 },
  { name: "sd", height: 432, crf: 28 },
] as const;

const FILE = /^(\d+)-([0-9a-f]{10})-(hd|sd)\.mp4$/;

/**
 * Short muted clips for the homepage hero, made on this server.
 *
 * Whenever the hero's lineup changes (CatalogService announces it), and as
 * a fallback every two hours: for each title in the hero that our own player can play
 * (an AniLibria stream), ten seconds of episode 1 — just after its opening
 * when AniLibria marks where that ends — are cut and compressed by ffmpeg,
 * one title and one size at a time, at low CPU priority. Clips of titles
 * that have left the hero are deleted on the same pass, so the folder only
 * ever holds the hero's handful of titles (a few megabytes).
 *
 * The page shows the picture first and fades the clip in once it plays;
 * without ffmpeg on the server (FFMPEG_PATH) there are simply no clips.
 */
export class HeroClipService {
  private readonly prisma: PrismaClient;
  private readonly logger: HeroClipServiceDeps["logger"];
  private readonly spotlightIds: HeroClipServiceDeps["spotlightIds"];
  private readonly dir: string;
  private readonly ffmpeg: string;
  private clips: HeroClips = {};
  private running = false;
  /** The lineup changed during a pass: one more pass when it ends. */
  private again = false;
  private unavailable = false;

  constructor(deps: HeroClipServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.spotlightIds = deps.spotlightIds;
    this.dir = deps.dir;
    this.ffmpeg = deps.ffmpeg;
    // What a previous run left is listed at once, not after the first pass.
    void this.index();
  }

  /** The clips there are, by title id. */
  list(): HeroClips {
    return this.clips;
  }

  /** The file behind a clip's address, or null for anything else. */
  path(file: string): string | null {
    return FILE.test(file) ? join(this.dir, file) : null;
  }

  async refresh(): Promise<void> {
    if (this.unavailable) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      await mkdir(this.dir, { recursive: true });
      const ids = (await this.spotlightIds()).slice(0, 8);
      const wanted = new Set<string>();
      let made = 0;
      for (const id of ids) {
        const plan = await this.plan(id);
        if (!plan) continue;
        for (const rendition of RENDITIONS) {
          const file = `${id}-${plan.key}-${rendition.name}.mp4`;
          wanted.add(file);
          if (await exists(join(this.dir, file))) continue;
          const ok = await this.cut(plan.url, plan.start, rendition, join(this.dir, file));
          if (this.unavailable) return;
          if (ok) made += 1;
        }
        // Each title shows up as soon as both its sizes are made.
        await this.index();
      }
      const removed = await this.sweep(wanted);
      await this.index();
      if (made > 0 || removed > 0) this.logger.info({ made, removed, titles: Object.keys(this.clips).length }, "hero clips updated");
    } catch (error) {
      this.logger.warn({ error }, "hero clips failed");
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        void this.refresh();
      }
    }
  }

  /** Which stream and moment a title's clip comes from — or null when our
   *  own player has nothing for it. The key changes with either, so a new
   *  stream makes a new clip. */
  private async plan(animeId: number): Promise<{ url: string; start: number; key: string } | null> {
    const source = await this.prisma.playerSource.findFirst({
      where: { animeId, format: "hls" },
      orderBy: { position: "asc" },
      select: { hlsEpisodes: true, hlsVariants: true, episodeMeta: true },
    });
    if (!source) return null;
    const variants = (source.hlsVariants as Record<string, Record<string, string>> | null)?.["1"];
    const url =
      variants?.["720"] ?? variants?.["1080"] ?? variants?.["480"] ?? (source.hlsEpisodes as Record<string, string> | null)?.["1"];
    if (!url || !/^https:\/\//.test(url)) return null;
    const opening = (source.episodeMeta as Record<string, { opening?: { start: number; stop: number } | null }> | null)?.["1"]
      ?.opening;
    // A little past the end of the opening: the episode itself, not credits.
    const start = opening && opening.stop > 0 && opening.stop < 900 ? Math.round(opening.stop + 20) : FALLBACK_START;
    const key = createHash("sha1").update(`${url}|${start}`).digest("hex").slice(0, 10);
    return { url, start, key };
  }

  private cut(
    url: string,
    start: number,
    rendition: (typeof RENDITIONS)[number],
    out: string,
  ): Promise<boolean> {
    const tmp = `${out}.tmp.mp4`;
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      // Seeking before the input jumps straight to the right segment.
      "-ss",
      String(start),
      "-i",
      url,
      "-t",
      String(CLIP_SECONDS),
      "-an",
      "-vf",
      `scale=-2:${rendition.height}:flags=lanczos,fps=24`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-tune",
      "film",
      "-crf",
      String(rendition.crf),
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      tmp,
    ];
    return new Promise((resolve) => {
      const child = spawn(this.ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-2000);
      });
      // The site's requests come first: encoding runs at low priority.
      if (child.pid) {
        try {
          setPriority(child.pid, 15);
        } catch {
          // Not allowed here — it runs at normal priority then.
        }
      }
      const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (error.code === "ENOENT") {
          this.unavailable = true;
          this.logger.warn({ ffmpeg: this.ffmpeg }, "ffmpeg not found — the hero shows pictures only");
        }
        resolve(false);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          this.logger.warn({ code, stderr: stderr.trim().slice(-400) }, "hero clip not made");
          void rm(tmp, { force: true });
          resolve(false);
          return;
        }
        rename(tmp, out)
          .then(() => resolve(true))
          .catch(() => resolve(false));
      });
    });
  }

  /** Deletes every clip no title in the hero needs any more. */
  private async sweep(wanted: Set<string>): Promise<number> {
    let removed = 0;
    for (const file of await readdir(this.dir).catch(() => [] as string[])) {
      if (wanted.has(file)) continue;
      await rm(join(this.dir, file), { force: true });
      removed += 1;
    }
    return removed;
  }

  private async index(): Promise<void> {
    const clips: HeroClips = {};
    for (const file of await readdir(this.dir).catch(() => [] as string[])) {
      const match = FILE.exec(file);
      if (!match) continue;
      const entry = (clips[match[1]!] ??= {} as HeroClips[string]);
      entry[match[3] as "hd" | "sd"] = `/api/hero/${file}`;
    }
    // Only titles with both sizes made.
    this.clips = Object.fromEntries(Object.entries(clips).filter(([, c]) => c.hd && c.sd));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}
