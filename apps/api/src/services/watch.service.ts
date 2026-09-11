import type { PrismaClient } from "@animeshadow/db";
import {
  type KodikClient,
  toWatchSources as kodikToSources,
} from "@animeshadow/kodik";
import type { AllohaClient } from "@animeshadow/alloha";
import type { WatchResponse, WatchSource } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";

interface WatchLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface WatchServiceDeps {
  prisma: PrismaClient;
  kodik: KodikClient;
  alloha: AllohaClient;
  embedTemplate?: string | undefined;
  logger: WatchLogger;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RECHECK_MS = 3 * 24 * 60 * 60_000;
const MAX_ALLOHA_DUBS = 6;

/**
 * Resolves playable sources for an anime across providers — Kodik first (best
 * anime coverage + RU dubs), then Alloha as a fallback aggregator. The app
 * never hosts video; it embeds the iframe URLs providers return. Results are
 * cached in `PlayerSource` so the detail page renders without a live call, and
 * `WatchAvailability` lets the catalogue badge cards.
 */
export class WatchService {
  private readonly prisma: PrismaClient;
  private readonly kodik: KodikClient;
  private readonly alloha: AllohaClient;
  private readonly embedTemplate?: string;
  private readonly logger: WatchLogger;
  private readonly cache = new TtlCache<WatchResponse>(30 * 60_000, 512);

  constructor(deps: WatchServiceDeps) {
    this.prisma = deps.prisma;
    this.kodik = deps.kodik;
    this.alloha = deps.alloha;
    this.embedTemplate = deps.embedTemplate;
    this.logger = deps.logger;
  }

  async getSources(malId: number): Promise<WatchResponse> {
    return this.cache.wrap(String(malId), async () => {
      const cached = await this.readCached(malId);
      if (cached) return cached;
      return this.resolveAndPersist(malId);
    });
  }

  async warm(limit: number): Promise<void> {
    if (limit <= 0) return;
    const staleBefore = new Date(Date.now() - RECHECK_MS);
    const targets = await this.prisma.anime.findMany({
      where: {
        OR: [
          { watchAvailability: null },
          { watchAvailability: { checkedAt: { lt: staleBefore } } },
          { watchAvailability: { hasPlayer: null } },
        ],
      },
      orderBy: [{ members: { sort: "desc", nulls: "last" } }],
      take: limit,
      select: { id: true },
    });
    if (targets.length === 0) return;

    this.logger.info({ count: targets.length }, "warming player availability");
    let hits = 0;
    for (const { id } of targets) {
      const result = await this.resolveAndPersist(id, true).catch(() => null);
      if (result?.available) hits += 1;
      await sleep(120);
    }
    this.logger.info({ checked: targets.length, withPlayer: hits }, "player warm done");
  }

  // -- internals ------------------------------------------------------

  private async readCached(malId: number): Promise<WatchResponse | null> {
    const availability = await this.prisma.watchAvailability.findUnique({
      where: { animeId: malId },
    });
    if (
      !availability ||
      availability.hasPlayer == null ||
      Date.now() - availability.checkedAt.getTime() > RECHECK_MS
    ) {
      return null;
    }
    if (!availability.hasPlayer) {
      return { available: false, reason: "not_found", provider: null, sources: [] };
    }
    const rows = await this.prisma.playerSource.findMany({
      where: { animeId: malId },
      orderBy: { position: "asc" },
    });
    if (rows.length === 0) return null;
    return {
      available: true,
      reason: "ok",
      provider: availability.provider ?? "kodik",
      sources: rows.map((r) => ({
        id: `${r.provider}:${r.sourceKey}`,
        title: r.title,
        kind: r.kind as WatchSource["kind"],
        embedUrl: r.embedUrl,
        quality: r.quality,
        episodesCount: r.episodesCount,
      })),
    };
  }

  private async resolveAndPersist(
    malId: number,
    quiet = false,
  ): Promise<WatchResponse> {
    const sources: WatchSource[] = [];
    let kinopoiskId: number | null = null;
    let provider: string | null = null;

    // 1. Kodik
    try {
      const group = await this.kodik.getByShikimoriId(malId);
      if (group) {
        const kp = Number(group.primary.kinopoisk_id);
        if (Number.isInteger(kp) && kp > 0) kinopoiskId = kp;
        for (const s of kodikToSources(group)) {
          sources.push({ ...s, id: s.id });
        }
        if (sources.length > 0) provider = "kodik";
      }
    } catch (error) {
      if (!quiet) this.logger.warn({ error, malId }, "kodik lookup failed");
    }

    // 2. Alloha (needs a Kinopoisk id — from Kodik or a prior persist)
    if (kinopoiskId == null) {
      const anime = await this.prisma.anime.findUnique({
        where: { id: malId },
        select: { kinopoiskId: true },
      });
      kinopoiskId = anime?.kinopoiskId ?? null;
    }
    if (kinopoiskId != null) {
      try {
        const result = await this.alloha.getByKinopoiskId(kinopoiskId);
        if (result) {
          const perDub = Object.entries(result.translationIframes).slice(
            0,
            MAX_ALLOHA_DUBS,
          );
          if (perDub.length > 0) {
            for (const [tid, iframe] of perDub) {
              const name =
                result.translations.find((t) => t.id === tid)?.name ??
                `Озвучка ${tid}`;
              sources.push({
                id: `alloha:${tid}`,
                title: `${name} · Alloha`,
                kind: "voice",
                embedUrl: iframe,
                quality: result.quality,
                episodesCount: null,
              });
            }
          } else {
            sources.push({
              id: "alloha:main",
              title: "Alloha (агрегатор)",
              kind: "unknown",
              embedUrl: result.iframe,
              quality: result.quality,
              episodesCount: null,
            });
          }
          provider = provider ?? "alloha";
        }
      } catch (error) {
        if (!quiet) this.logger.warn({ error, malId }, "alloha lookup failed");
      }
    }

    // 3. Custom template fallback
    if (sources.length === 0 && this.embedTemplate) {
      sources.push({
        id: "custom:0",
        title: "Плеер",
        kind: "unknown",
        embedUrl: this.embedTemplate.replace(/\{mal_?id\}/gi, String(malId)),
        quality: null,
        episodesCount: null,
      });
      provider = "custom";
    }

    await this.persist(malId, kinopoiskId, provider, sources);

    if (sources.length === 0) {
      return { available: false, reason: "not_found", provider: null, sources: [] };
    }
    return { available: true, reason: "ok", provider, sources };
  }

  private async persist(
    malId: number,
    kinopoiskId: number | null,
    provider: string | null,
    sources: WatchSource[],
  ): Promise<void> {
    await Promise.all([
      kinopoiskId != null
        ? this.prisma.anime
            .update({ where: { id: malId }, data: { kinopoiskId } })
            .catch(() => undefined)
        : Promise.resolve(),
      this.prisma.watchAvailability
        .upsert({
          where: { animeId: malId },
          create: {
            animeId: malId,
            hasPlayer: sources.length > 0,
            sourceCount: sources.length,
            provider,
          },
          update: {
            hasPlayer: sources.length > 0,
            sourceCount: sources.length,
            provider,
            checkedAt: new Date(),
          },
        })
        .catch(() => undefined),
    ]);

    if (sources.length === 0) {
      await this.prisma.playerSource
        .deleteMany({ where: { animeId: malId } })
        .catch(() => undefined);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.playerSource.deleteMany({ where: { animeId: malId } }),
      this.prisma.playerSource.createMany({
        data: sources.map((s, index) => {
          const [prov, ...rest] = s.id.includes(":")
            ? s.id.split(":")
            : ["kodik", s.id];
          return {
            animeId: malId,
            provider: prov ?? "kodik",
            sourceKey: rest.join(":") || s.id,
            title: s.title,
            kind: s.kind,
            embedUrl: s.embedUrl,
            quality: s.quality,
            episodesCount: s.episodesCount,
            position: index,
          };
        }),
        skipDuplicates: true,
      }),
    ]);
  }
}
