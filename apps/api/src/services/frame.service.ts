import type { AniListClient } from "@animeshadow/anilist";
import {
  ANIME_WITH_GENRES_INCLUDE,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import type { FrameMatch, FrameSearchResponse } from "@animeshadow/shared";
import { BadRequestError, UpstreamUnavailableError } from "../lib/errors.js";

interface FrameLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface FrameServiceDeps {
  prisma: PrismaClient;
  anilist: AniListClient;
  logger: FrameLogger;
}

const TRACE_MOE_URL = "https://api.trace.moe/search";

/** Anything below this is, by trace.moe's own guidance, a coincidence. */
const MIN_SIMILARITY = 0.87;

/** Enough to show a clear winner plus a couple of runners-up. */
const MAX_RESULTS = 5;

/**
 * trace.moe's free tier allows a modest number of searches per IP per month
 * and one concurrent request. Nothing here should ever be called in a loop.
 */
const TIMEOUT_MS = 20_000;

/** 4MB of image is far more than identifying a frame ever needs. */
const MAX_BYTES = 4 * 1024 * 1024;

interface RawTraceResult {
  anilist?: number;
  filename?: string;
  episode?: number | number[] | null;
  from?: number;
  to?: number;
  similarity?: number;
  video?: string;
  image?: string;
}

/**
 * "Which anime is this screenshot from?" — trace.moe compares the frame
 * against its index of episode footage and answers with a title, an episode
 * and a timestamp.
 *
 * trace.moe identifies titles by AniList id, which is the one id our
 * catalogue does not key on. AniList itself is the bridge: its Media node
 * carries both its own id and the MyAnimeList id we do key on, so a match is
 * resolved exactly rather than by comparing title text.
 */
export class FrameService {
  private readonly prisma: PrismaClient;
  private readonly anilist: AniListClient;
  private readonly logger: FrameLogger;

  constructor(deps: FrameServiceDeps) {
    this.prisma = deps.prisma;
    this.anilist = deps.anilist;
    this.logger = deps.logger;
  }

  async searchByFrame(dataUrl: string): Promise<FrameSearchResponse> {
    const image = decodeDataUrl(dataUrl);

    let response: Response;
    try {
      response = await fetch(`${TRACE_MOE_URL}?cutBorders`, {
        method: "POST",
        headers: { "content-type": image.mime },
        body: new Uint8Array(image.bytes),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn({ error }, "trace.moe request failed");
      throw new UpstreamUnavailableError("Frame search is temporarily unavailable");
    }

    if (!response.ok) {
      // 402 is the free tier's monthly quota, 429 its concurrency limit —
      // both are "try later", neither is the caller's fault, and both read
      // identically to the visitor.
      this.logger.warn({ status: response.status }, "trace.moe rejected the search");
      throw new UpstreamUnavailableError("Frame search is temporarily unavailable");
    }

    const body = (await response.json().catch(() => null)) as {
      frameCount?: number;
      error?: string;
      result?: RawTraceResult[];
    } | null;

    if (!body || body.error) {
      throw new UpstreamUnavailableError(body?.error || "Frame search failed");
    }

    const hits = (body.result ?? [])
      .filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY && r.anilist != null)
      .slice(0, MAX_RESULTS);

    const results = await this.attachCatalogue(hits);

    return { results, framesSearched: body.frameCount ?? 0 };
  }

  /**
   * Turns AniList ids into our own catalogue entries. The AniList lookups run
   * in sequence rather than in parallel — the client serialises them anyway to
   * respect the rate limit, and there are at most five.
   */
  private async attachCatalogue(hits: RawTraceResult[]): Promise<FrameMatch[]> {
    const malIdByAnilistId = new Map<number, number>();
    for (const hit of hits) {
      const anilistId = hit.anilist;
      if (anilistId == null || malIdByAnilistId.has(anilistId)) continue;
      const media = await this.anilist.getById(anilistId).catch(() => null);
      if (media?.idMal != null) malIdByAnilistId.set(anilistId, media.idMal);
    }

    const malIds = [...malIdByAnilistId.values()];
    const rows =
      malIds.length > 0
        ? await this.prisma.anime.findMany({
            where: { id: { in: malIds } },
            include: ANIME_WITH_GENRES_INCLUDE,
          })
        : [];
    const byId = new Map(rows.map((row) => [row.id, toSummaryDto(row)]));

    return hits.map((hit) => {
      const malId = hit.anilist != null ? malIdByAnilistId.get(hit.anilist) : undefined;
      const anime = malId != null ? byId.get(malId) ?? null : null;
      return {
        anime,
        // trace.moe's filename is the raw release filename, which is noisy but
        // is the only label we have when the title is not in our catalogue.
        title: anime?.title ?? cleanFilename(hit.filename) ?? "—",
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
