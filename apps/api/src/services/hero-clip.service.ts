import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { setPriority } from "node:os";
import { join } from "node:path";
import type { AniLibriaClient } from "@animeshadow/anilibria";
import type { PrismaClient } from "@animeshadow/db";
import type { HeroClips } from "@animeshadow/shared";
import { fetchSkipTimes } from "../lib/skip-times.js";

export interface HeroClipServiceDeps {
  prisma: PrismaClient;
  anilibria: AniLibriaClient;
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  /** The titles in the homepage hero right now, in order. */
  spotlightIds: () => Promise<number[]>;
  /** Finds a title's players (AniLibria among them) when none are known yet. */
  resolveSources: (animeId: number) => Promise<unknown>;
  dir: string;
  ffmpeg: string;
}

/**
 * Seconds of video per clip — and so how long its slide stays up: the page
 * moves on when the clip ends.
 */
const CLIP_SECONDS = 12;
/** Where the clip starts when no episode has its opening marked. */
const FALLBACK_START = 150;
/** How long one ffmpeg run may take before it is stopped. */
const RUN_TIMEOUT_MS = 150_000;
/** Episodes whose opening is looked for, in order: the first episode often
 *  has none (or has it at the end), the second nearly always does. */
const EPISODES = ["2", "1", "3", "4"];

/**
 * The two sizes made of every clip: a computer's wide hero and a phone's.
 * H.264 in MP4 plays everywhere, Safari on an iPhone included; CRF with a
 * rate cap, the "slow" preset and the film tuning keep the picture clean at
 * under 2 MB for twelve seconds of an opening at 720p, under 800 KB at
 * 432p. No sound (the hero plays muted), and `faststart` so it starts
 * before it has all loaded.
 */
const RENDITIONS = [
  { name: "hd", height: 720, crf: 27, maxrate: "1200k" },
  { name: "sd", height: 432, crf: 29, maxrate: "500k" },
] as const;

const FILE = /^(\d+)-([0-9a-f]{10})-(hd|sd)\.mp4$/;

/**
 * Short muted clips for the homepage hero, made on this server.
 *
 * Whenever the hero's lineup changes (CatalogService announces it), and as
 * a fallback every two hours: for each title in the hero that our own player
 * can play (an AniLibria release), twelve seconds from the middle of its
 * opening — the liveliest part of an episode — are cut and compressed by
 * ffmpeg, one title and one size at a time, at low CPU priority. Where the
 * opening sits comes from AniLibria's own marks, then from AniSkip.
 *
 * The stream addresses are asked from AniLibria afresh for every clip: the
 * ones stored with the player go stale, and can point at a mirror this
 * server can't reach. Every quality is tried before a title is given up on.
 *
 * Clips of titles that have left the hero are deleted on the same pass, so
 * the folder only ever holds the hero's handful of titles (a few megabytes).
 * The page shows the picture first and fades the clip in once it plays;
 * without ffmpeg on the server (FFMPEG_PATH) there are simply no clips.
 */
export class HeroClipService {
  private readonly prisma: PrismaClient;
  private readonly anilibria: AniLibriaClient;
  private readonly logger: HeroClipServiceDeps["logger"];
  private readonly spotlightIds: HeroClipServiceDeps["spotlightIds"];
  private readonly resolveSources: HeroClipServiceDeps["resolveSources"];
  private readonly dir: string;
  private readonly ffmpeg: string;
  private clips: HeroClips = {};
  private running = false;
  /** The lineup changed during a pass: one more pass when it ends. */
  private again = false;
  private unavailable = false;
  private child: ReturnType<typeof spawn> | null = null;

  close(): void {
    this.unavailable = true;
    this.again = false;
    this.child?.kill("SIGKILL");
  }

  constructor(deps: HeroClipServiceDeps) {
    this.prisma = deps.prisma;
    this.anilibria = deps.anilibria;
    this.logger = deps.logger;
    this.spotlightIds = deps.spotlightIds;
    this.resolveSources = deps.resolveSources;
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
      const missed: number[] = [];
      for (const id of ids) {
        const plan = await this.plan(id);
        if (!plan) {
          missed.push(id);
          continue;
        }
        // A title keeps the clip it has while a new one is being made.
        const previous = this.clips[String(id)];
        for (const rendition of RENDITIONS) {
          const file = `${id}-${plan.key}-${rendition.name}.mp4`;
          wanted.add(file);
          if (await exists(join(this.dir, file))) continue;
          const ok = await this.cutFromAny(plan.urls, plan.start, rendition, join(this.dir, file));
          if (this.unavailable) return;
          if (ok) made += 1;
        }
        const complete = await Promise.all(
          RENDITIONS.map((r) => exists(join(this.dir, `${id}-${plan.key}-${r.name}.mp4`))),
        );
        if (!complete.every(Boolean)) {
          missed.push(id);
          if (previous) for (const url of Object.values(previous)) wanted.add(url.slice(url.lastIndexOf("/") + 1));
        }
        // Each title shows up as soon as both its sizes are made.
        await this.index();
      }
      const removed = await this.sweep(wanted);
      await this.index();
      if (made > 0 || removed > 0 || missed.length > 0) {
        this.logger.info({ made, removed, missed, titles: Object.keys(this.clips).length }, "hero clips updated");
      }
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

  /**
   * Which episode and moment a title's clip comes from, and the addresses
   * to cut it from (best first) — or null when our own player has nothing
   * for it. The key follows the release, episode and moment, not the
   * address (which changes with the mirror), so a clip is only made again
   * when what it shows would change.
   */
  private async plan(animeId: number): Promise<{ urls: string[]; start: number; key: string } | null> {
    let source = await this.storedSource(animeId);
    if (!source) {
      // Not looked up yet: finding its players is what the title page does
      // on its first open anyway.
      await this.resolveSources(animeId).catch(() => undefined);
      source = await this.storedSource(animeId);
    }
    if (!source) return null;

    const storedVariants = (source.hlsVariants as Record<string, Record<string, string>> | null) ?? {};
    const storedEpisodes = (source.hlsEpisodes as Record<string, string> | null) ?? {};
    const storedMeta =
      (source.episodeMeta as Record<string, { opening?: { start: number; stop: number } | null }> | null) ?? {};
    const releaseId = source.anilibriaId ?? releaseIdOf(Object.values(storedEpisodes)[0]);

    // Fresh addresses and opening marks from AniLibria itself.
    const release = releaseId != null ? await this.anilibria.releaseById(releaseId).catch(() => null) : null;
    const fresh = new Map((release?.episodes ?? []).map((e) => [String(e.ordinal), e]));
    const episodes = [...new Set([...fresh.keys(), ...Object.keys(storedEpisodes)])];
    if (episodes.length === 0) return null;

    const openingOf = (episode: string) => fresh.get(episode)?.opening ?? storedMeta[episode]?.opening ?? null;
    let episode = EPISODES.find((e) => episodes.includes(e) && usable(openingOf(e))) ?? null;
    let opening = episode ? openingOf(episode) : null;
    if (!episode) {
      // Nothing marked by AniLibria: AniSkip's crowd-sourced marks (keyed by
      // MAL id, which is ours).
      for (const candidate of EPISODES.filter((e) => episodes.includes(e)).slice(0, 2)) {
        const times = await fetchSkipTimes(animeId, Number(candidate));
        if (usable(times.opening)) {
          episode = candidate;
          opening = times.opening;
          break;
        }
      }
    }
    episode ??= episodes.includes("1") ? "1" : episodes.sort((a, b) => Number(a) - Number(b))[0]!;

    // From the middle of the opening on — its chorus, not its slow start.
    const start =
      opening && usable(opening)
        ? Math.max(0, Math.round((opening.start + opening.stop) / 2 - 2))
        : FALLBACK_START;

    const own = fresh.get(episode);
    const stored = storedVariants[episode] ?? {};
    const urls = [
      own?.hls720,
      own?.hls1080,
      own?.hls480,
      stored["720"],
      stored["1080"],
      stored["480"],
      storedEpisodes[episode],
    ].filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
    if (urls.length === 0) return null;
    const key = createHash("sha1")
      .update(`${releaseId ?? animeId}|${episode}|${start}|${CLIP_SECONDS}`)
      .digest("hex")
      .slice(0, 10);
    return { urls: [...new Set(urls)], start, key };
  }

  private async storedSource(animeId: number) {
    const [source, availability] = await Promise.all([
      this.prisma.playerSource.findFirst({
        where: { animeId, format: "hls" },
        orderBy: { position: "asc" },
        select: { hlsEpisodes: true, hlsVariants: true, episodeMeta: true },
      }),
      this.prisma.watchAvailability.findUnique({ where: { animeId }, select: { anilibriaId: true } }),
    ]);
    return source ? { ...source, anilibriaId: availability?.anilibriaId ?? null } : null;
  }

  /** Tries each address in turn: a mirror that doesn't answer is skipped in
   *  seconds rather than holding ffmpeg until its time runs out. */
  private async cutFromAny(
    urls: string[],
    start: number,
    rendition: (typeof RENDITIONS)[number],
    out: string,
  ): Promise<boolean> {
    for (const url of urls) {
      if (!(await reachable(url))) continue;
      if (await this.cut(url, start, rendition, out)) return true;
      if (this.unavailable) return false;
    }
    return false;
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
      "-maxrate",
      rendition.maxrate,
      "-bufsize",
      `${parseInt(rendition.maxrate, 10) * 2}k`,
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
      this.child = child;
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
        if (this.child === child) this.child = null;
        clearTimeout(timer);
        if (error.code === "ENOENT") {
          this.unavailable = true;
          this.logger.warn({ ffmpeg: this.ffmpeg }, "ffmpeg not found — the hero shows pictures only");
        }
        resolve(false);
      });
      child.on("close", (code) => {
        if (this.child === child) this.child = null;
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

/** An opening mark that makes sense for a clip of CLIP_SECONDS. */
function usable(opening: { start: number; stop: number } | null | undefined): opening is { start: number; stop: number } {
  return opening != null && opening.stop - opening.start >= CLIP_SECONDS + 10 && opening.stop < 1200;
}

/** AniLibria's release id from one of its stream addresses
 *  (…/videos/media/ts/<release>/<episode>/…). */
function releaseIdOf(url: string | undefined): number | null {
  const match = url ? /\/media\/ts\/(\d+)\//.exec(url) : null;
  return match ? Number(match[1]) : null;
}

/** Whether a stream's playlist answers at all, within a few seconds. */
async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return false;
    const text = await res.text();
    return text.startsWith("#EXTM3U");
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}
