import { createHash } from "node:crypto";
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
}

const TRACE_MOE_URL = "https://api.trace.moe/search";

/** Anything below this is, by trace.moe's own guidance, a coincidence. */
const MIN_SIMILARITY = 0.87;

/** Enough to show a clear winner plus a couple of runners-up. */
const MAX_RESULTS = 5;

const TIMEOUT_MS = 25_000;

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

  /**
   * Answers by image hash. The same screenshot searched twice — or by two
   * people — costs one search out of a small monthly quota, not two.
   */
  private readonly cache = new TtlCache<FrameSearchResponse>(6 * 60 * 60_000, 200);

  constructor(deps: FrameServiceDeps) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.apiKey = deps.apiKey;
  }

  async searchByFrame(dataUrl: string, allowAdult: boolean): Promise<FrameSearchResponse> {
    const image = decodeDataUrl(dataUrl);
    const key = `${allowAdult ? "a" : "s"}:${createHash("sha256").update(image.bytes).digest("hex")}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let response: Response;
    try {
      response = await fetch(`${TRACE_MOE_URL}?cutBorders&anilistInfo`, {
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
        throw failure("quota", "The monthly frame-search quota is used up");
      }
      if (response.status === 429) {
        throw failure("busy", "Another frame search is already running");
      }
      throw failure("unavailable", "Frame search is temporarily unavailable");
    }

    const body = (await response.json().catch(() => null)) as {
      frameCount?: number;
      error?: string;
      result?: RawTraceResult[];
    } | null;

    if (!body || body.error) {
      this.logger.warn({ error: body?.error }, "trace.moe returned an error");
      throw failure("unavailable", body?.error || "Frame search failed");
    }

    const hits = (body.result ?? [])
      .filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY)
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
      framesSearched: body.frameCount ?? 0,
    };
    this.cache.set(key, result);
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
        fromSeconds: hit.from ?? 0,
        toSeconds: hit.to ?? 0,
        similarity: hit.similarity ?? 0,
        previewVideo: hit.video ?? null,
        previewImage: hit.image ?? null,
      };
    });
  }
}

/** `episode` comes back as a number, a range, or nothing at all. */
function normaliseEpisode(episode: number | number[] | null | undefined): number | null {
  if (Array.isArray(episode)) return episode[0] ?? null;
  return typeof episode === "number" ? episode : null;
}

/** Strips the scene-release noise around a title, best effort. */
function cleanFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const withoutExt = filename.replace(/\.[a-z0-9]{2,4}$/i, "");
  const withoutTags = withoutExt.replace(/[[(][^\])]*[\])]/g, " ");
  const cleaned = withoutTags.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
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
