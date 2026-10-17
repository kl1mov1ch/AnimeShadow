import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  ANIME_WITH_GENRES_INCLUDE,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import type { FrameMatch, FrameSearchResponse } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { AppError, BadRequestError } from "../lib/errors.js";

interface FrameLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface FrameServiceDeps {
  prisma: PrismaClient;
  logger: FrameLogger;
  /**
   * Optional trace.moe API key. Without one, the free tier allows 100
   * searches a month per IP and one at a time — and on a server every visitor
   * shares that one IP, so the whole site gets 100 a month between them.
   */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}

const TRACE_MOE_URL = "https://api.trace.moe/search";

/** Anything below this is, by trace.moe's own guidance, a coincidence. */
const MIN_SIMILARITY = 0.87;

/** Enough to show a clear winner plus a couple of runners-up. */
const MAX_RESULTS = 5;

const TIMEOUT_MS = 20_000;
/** A frame this size identifies as well as a 4K one, and uploads and matches far faster. */
const SEND_SIDE = 640;
/** How long one search may wait its turn before it is told the queue is too long. */
const MAX_WAIT_MS = 60_000;
/** More waiting than this and a new search is turned away at once instead of hanging. */
const MAX_QUEUE = 12;

/** 4MB of image is far more than identifying a frame ever needs. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Why a search could not be run — sent to the browser as `fields.reason` so
 * it can say something more useful than "unavailable".
 */
export type FrameSearchFailure = "quota" | "busy" | "unavailable";

interface RawTraceResult {
  /**
   * With `anilistInfo` on the request this is an object, not a bare id — it
   * carries the MyAnimeList id our catalogue keys on, so no second lookup is
   * needed to find the title.
   */
  anilist?:
    | {
        id?: number;
        idMal?: number | null;
        isAdult?: boolean;
        title?: { english?: string | null; romaji?: string | null; native?: string | null };
      }
    | number;
  filename?: string;
  episode?: number | number[] | null;
  from?: number;
  to?: number;
  similarity?: number;
  video?: string;
  image?: string;
}

function failure(reason: FrameSearchFailure, message: string): AppError {
  return new AppError(503, "UPSTREAM_UNAVAILABLE", message, { reason: [reason] });
}

/**
 * "Which anime is this screenshot from?" — trace.moe compares the frame
 * against its index of episode footage and answers with a title, an episode
 * and a timestamp.
 *
 * It used to identify each hit by AniList id alone, then ask AniList — one
 * serialised request per hit, no deadline — which MyAnimeList id that was. On
 * a server that is the slow part: up to five extra round trips queued behind
 * everything else going to AniList. `anilistInfo` makes trace.moe include the
 * MyAnimeList id and titles in its own answer, so there is no second lookup
 * at all.
 */
export class FrameService {
  private readonly prisma: PrismaClient;
  private readonly logger: FrameLogger;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  /**
   * Answers by image hash. The same screenshot searched twice — or by two
   * people — costs one search out of a small monthly quota, not two.
   */
  private readonly cache = new TtlCache<FrameSearchResponse>(20 * 60_000, 500);
  /** The same frame asked for while it is being searched: one search, everyone gets its answer. */
  private readonly inFlight = new Map<string, Promise<FrameSearchResponse>>();
  private preparing = 0;
  private refreshing: Promise<void> | null = null;

  /**
   * trace.moe runs as many searches at once as the account allows — one on
   * the free tier, for the whole site's IP. Searches beyond that wait here
   * in order instead of failing with "busy" or piling up on trace.moe.
   */
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private limits = { concurrency: 1, quota: 100, quotaUsed: 0, at: 0 };

  constructor(deps: FrameServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.apiKey = deps.apiKey;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /** How many searches are ahead right now — for the page's "в очереди". */
  queue(): { running: number; waiting: number; quotaLeft: number | null } {
    return {
      running: this.running,
      waiting: this.waiting.length,
      quotaLeft: this.limits.at ? Math.max(0, this.limits.quota - this.limits.quotaUsed) : null,
    };
  }

  /** The account's concurrency and what is left of the month, asked at most every five minutes. */
  private async refreshLimits(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (Date.now() - this.limits.at < 5 * 60_000) return;
    this.refreshing = this.readLimits().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async readLimits(): Promise<void> {
    try {
      const res = await this.fetchImpl("https://api.trace.moe/me", {
        headers: this.apiKey ? { "x-trace-key": this.apiKey } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const me = (await res.json()) as { concurrency?: number; quota?: number; quotaUsed?: number };
      this.limits = {
        concurrency: Math.max(1, Math.min(4, Math.floor(me.concurrency ?? 1))),
        quota: me.quota ?? this.limits.quota,
        quotaUsed: me.quotaUsed ?? this.limits.quotaUsed,
        at: Date.now(),
      };
    } catch {
      // Keep what we had.
    }
  }

  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.limits.concurrency) {
      if (this.waiting.length >= MAX_QUEUE) throw failure("busy", "Too many frame searches waiting");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = this.waiting.indexOf(go);
          if (i >= 0) this.waiting.splice(i, 1);
          reject(failure("busy", "Frame search queue is too long right now"));
        }, MAX_WAIT_MS);
        const go = () => {
          clearTimeout(timer);
          resolve();
        };
        this.waiting.push(go);
      });
    }
    this.running += 1;
    try {
      return await work();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }

  async searchByFrame(dataUrl: string, allowAdult: boolean): Promise<FrameSearchResponse> {
    if (this.inFlight.size >= MAX_QUEUE + 4 || this.preparing >= 4) throw failure("busy", "Too many frame searches waiting");
    const decoded = decodeDataUrl(dataUrl);
    // Shrunk before anything else: a small JPEG uploads in a blink and
    // matches faster, and the same picture sent at another size or format
    // hashes the same.
    this.preparing += 1;
    let image: { mime: string; bytes: Buffer };
    try { image = await shrink(decoded); }
    finally { this.preparing -= 1; }
    const key = `${allowAdult ? "a" : "s"}:${createHash("sha256").update(image.bytes).digest("hex")}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = (async () => {
      await this.refreshLimits();
      if (this.limits.at && this.limits.quotaUsed >= this.limits.quota) {
        throw failure("quota", "The monthly frame-search quota is used up");
      }
      return this.slot(async () => {
        // Recheck after waiting: another request may have spent the last credit.
        if (this.limits.at && this.limits.quotaUsed >= this.limits.quota) throw failure("quota", "The monthly frame-search quota is used up");
        let result = await this.ask(image, allowAdult);
        if (!result.results.length && this.limits.quotaUsed < this.limits.quota) {
          const flipped = await sharp(image.bytes).flop().jpeg({ quality: 90 }).toBuffer();
          const retry = await this.ask({ mime: "image/jpeg", bytes: flipped }, allowAdult);
          result = { ...retry, framesSearched: result.framesSearched + retry.framesSearched };
        }
        this.cache.set(key, result);
        return result;
      });
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async ask(image: { mime: string; bytes: Buffer }, allowAdult: boolean): Promise<FrameSearchResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${TRACE_MOE_URL}?cutBorders&anilistInfo`, {
        method: "POST",
        headers: {
          "content-type": image.mime,
          ...(this.apiKey ? { "x-trace-key": this.apiKey } : {}),
        },
        body: new Uint8Array(image.bytes),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn({ error }, "trace.moe request failed");
      throw failure("unavailable", "Frame search is temporarily unavailable");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      this.logger.warn({ status: response.status, detail: detail.slice(0, 200) }, "trace.moe rejected the search");
      // The two limits of the free tier, each told apart, because each asks
      // the visitor for something different: wait a month, or wait a minute.
      if (response.status === 402) {
        this.limits.quotaUsed = this.limits.quota;
        throw failure("quota", "The monthly frame-search quota is used up");
      }
      if (response.status === 429) {
        throw failure("busy", "Another frame search is already running");
      }
      throw failure("unavailable", "Frame search is temporarily unavailable");
    }

    this.limits.quotaUsed += 1;
    const body = (await response.json().catch(() => null)) as {
      frameCount?: number;
      error?: string;
      result?: RawTraceResult[];
    } | null;

    if (!body || body.error || !Array.isArray(body.result)) {
      this.logger.warn({ error: body?.error }, "trace.moe returned an error");
      throw failure("unavailable", body?.error || "Frame search failed");
    }

    const hits = (body.result ?? [])
      .filter((r) => r != null && typeof r === "object" && Number.isFinite(r.similarity) && (r.similarity ?? 0) >= MIN_SIMILARITY && (r.similarity ?? 0) <= 1)
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      // Same content rules as the rest of the site: an adult title is only
      // shown to someone who has confirmed their age.
      .filter((r) => allowAdult || !(typeof r.anilist === "object" && r.anilist?.isAdult))
      // trace.moe often returns several moments from the same episode of the
      // same show. Listed as-is that is three identical rows, which reads as
      // a bug; the answer to "which anime is this" is one row per anime. The
      // list arrives best-first, so the first of each is the one to keep.
      .filter((r, i, all) => {
        const key = typeof r.anilist === "object" ? r.anilist?.id : r.anilist ?? r.filename;
        return all.findIndex((o) => (typeof o.anilist === "object" ? o.anilist?.id : o.anilist ?? o.filename) === key) === i;
      })
      .slice(0, MAX_RESULTS);

    const result: FrameSearchResponse = {
      results: await this.attachCatalogue(hits),
      framesSearched: Number.isFinite(body.frameCount) ? Math.max(0, Math.floor(body.frameCount!)) : 0,
    };
    return result;
  }

  /** One database query for every hit, by the MyAnimeList ids trace.moe sent. */
  private async attachCatalogue(hits: RawTraceResult[]): Promise<FrameMatch[]> {
    const malIds = [
      ...new Set(
        hits
          .map((h) => (typeof h.anilist === "object" ? h.anilist?.idMal : null))
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const rows =
      malIds.length > 0
        ? await this.prisma.anime.findMany({
            where: { id: { in: malIds } },
            include: ANIME_WITH_GENRES_INCLUDE,
          })
        : [];
    const byId = new Map(rows.map((row) => [row.id, toSummaryDto(row)]));

    return hits.map((hit) => {
      const info = typeof hit.anilist === "object" ? hit.anilist : undefined;
      const malId = info?.idMal ?? undefined;
      const anime = malId != null ? byId.get(malId) ?? null : null;
      // When the title is not in our catalogue, AniList's own name for it is
      // a far better label than the release filename used to be.
      const fallbackTitle =
        info?.title?.english || info?.title?.romaji || info?.title?.native || cleanFilename(hit.filename);
      return {
        anime,
        title: anime?.title ?? fallbackTitle ?? "—",
        episode: normaliseEpisode(hit.episode),
        fromSeconds: Number.isFinite(hit.from) ? Math.max(0, hit.from!) : 0,
        toSeconds: Number.isFinite(hit.to) ? Math.max(0, hit.to!) : 0,
        similarity: hit.similarity ?? 0,
        previewVideo: traceMediaUrl(hit.video),
        previewImage: traceMediaUrl(hit.image),
      };
    });
  }
}

/** `episode` comes back as a number, a range, or nothing at all. */
function normaliseEpisode(episode: number | number[] | null | undefined): number | null {
  const value = Array.isArray(episode) ? episode[0] : episode;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function traceMediaUrl(value?: string): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "trace.moe" || url.hostname.endsWith(".trace.moe")) ? url.href : null;
  } catch { return null; }
}

/** Strips the scene-release noise around a title, best effort. */
function cleanFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const withoutExt = filename.replace(/\.[a-z0-9]{2,4}$/i, "");
  const withoutTags = withoutExt.replace(/[[(][^\])]*[\])]/g, " ");
  const cleaned = withoutTags.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** At most 640 px on the long side, as JPEG — what trace.moe needs, nothing more. */
async function shrink(image: { mime: string; bytes: Buffer }): Promise<{ mime: string; bytes: Buffer }> {
  try {
    const bytes = await sharp(image.bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: SEND_SIDE, height: SEND_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { mime: "image/jpeg", bytes };
  } catch {
    throw new BadRequestError("Не удалось прочитать изображение. Выбери JPG, PNG или WebP до 40 Мп.");
  }
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new BadRequestError("Expected a base64 image data URL");
  }
  const bytes = Buffer.from(match[2] as string, "base64");
  if (bytes.byteLength === 0) {
    throw new BadRequestError("That image is empty");
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new BadRequestError("That image is too large");
  }
  return { mime: match[1] as string, bytes };
}
