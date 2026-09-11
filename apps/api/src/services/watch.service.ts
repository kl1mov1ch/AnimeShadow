import type { PrismaClient } from "@animeshadow/db";
import {
  type KodikClient,
  toWatchSources as kodikToSources,
} from "@animeshadow/kodik";
import type { AllohaClient, AllohaResult } from "@animeshadow/alloha";
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
// Mirrors rotate/die far faster than the 3-day provider re-resolve above —
// without its own short leash, a source that goes down right after being
// probed would keep ranking as "stable" (and getting served as the default
// pick) for up to 3 days, which is exactly what produces a long stuck load.
const SOURCE_RECHECK_MS = 6 * 60 * 60_000;
const MAX_ALLOHA_DUBS = 6;
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_CONCURRENCY = 4;

/** Dub studios that have historically been the least flaky — a nudge, not a gate. */
const TRUSTED_STUDIOS =
  /anilibria|animevost|shiza|studio.?band|dreamcast|anidub|jam.?club|kodik/i;

/**
 * How good a source is as the *default* pick. Verified-reachable beats
 * everything; after that prefer Kodik (best anime coverage), a real dub over
 * subs, fuller episode lists, and studios that tend to stay up.
 */
function rankSource(s: WatchSource): number {
  let score = 0;
  if (s.stable === true) score += 1000;
  else if (s.stable === false) score -= 1000;

  const provider = s.id.split(":")[0] ?? "";
  if (provider === "kodik") score += 100;
  else if (provider === "alloha") score += 50;
  else score += 10;

  if (s.kind === "voice") score += 30;
  else if (s.kind === "subtitles") score += 15;

  if (TRUSTED_STUDIOS.test(s.title)) score += 25;
  score += Math.min(s.episodesCount ?? 0, 50);
  return score;
}

function sortByStability(sources: WatchSource[]): WatchSource[] {
  return [...sources].sort((a, b) => rankSource(b) - rankSource(a));
}

/**
 * Split a source id into its stored composite key. Kodik hands us bare
 * translation ids ("609"), everything else is already "provider:key" — both
 * the row writer and the stability probe must agree on this or they address
 * different rows.
 */
function keyOf(id: string): { provider: string; sourceKey: string } {
  if (!id.includes(":")) return { provider: "kodik", sourceKey: id };
  const [provider, ...rest] = id.split(":");
  return { provider: provider || "kodik", sourceKey: rest.join(":") || id };
}

/**
 * Is this embed actually reachable right now? Providers rotate/retire mirrors
 * constantly, so a stored URL is no guarantee. We only look at the status —
 * the body is never read.
 */
async function probeEmbed(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (AnimeShadow player check)" },
    });
    // Drain nothing; just release the socket.
    void response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

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
  // Anime ids currently being refreshed in the background — so a stale
  // cache hit doesn't fire a duplicate full re-resolve on every request that
  // lands while the first refresh is still in flight.
  private readonly refreshingIds = new Set<number>();

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
    if (!availability || availability.hasPlayer == null) return null;

    // Past the recheck window: a full re-resolve can itself take several
    // seconds (network calls to Kodik/Alloha) — the single biggest
    // contributor to a slow player open. Rather than block this request on
    // that, serve what we already have (near-certainly still valid — mirrors
    // don't all disappear at once) and refresh in the background instead.
    const stale = Date.now() - availability.checkedAt.getTime() > RECHECK_MS;
    if (stale && !this.refreshingIds.has(malId)) {
      this.refreshingIds.add(malId);
      void this.resolveAndPersist(malId, true)
        .catch(() => undefined)
        .finally(() => this.refreshingIds.delete(malId));
    }

    if (!availability.hasPlayer) {
      return { available: false, reason: "not_found", provider: null, sources: [] };
    }
    const rows = await this.prisma.playerSource.findMany({
      where: { animeId: malId },
      orderBy: { position: "asc" },
    });
    // Nothing to serve yet even though hasPlayer was true — only case left
    // is a genuinely first-ever resolve racing us; fall through to a live one.
    if (rows.length === 0) return null;
    const sources: WatchSource[] = rows.map((r) => ({
      id: `${r.provider}:${r.sourceKey}`,
      title: r.title,
      kind: r.kind as WatchSource["kind"],
      embedUrl: r.embedUrl,
      quality: r.quality,
      episodesCount: r.episodesCount,
      stable: r.stable,
    }));

    // Never probed, or the verdict is old enough that a mirror could have
    // died since? Check in the background so the next open gets a fresh
    // pick; this response still goes out immediately with what we have.
    const staleProbeBefore = Date.now() - SOURCE_RECHECK_MS;
    if (
      rows.some(
        (r) =>
          r.stable == null ||
          r.stableAt == null ||
          r.stableAt.getTime() < staleProbeBefore,
      )
    ) {
      void this.probeAndPersist(malId, sources).catch(() => undefined);
    }

    return {
      available: true,
      reason: "ok",
      provider: availability.provider ?? "kodik",
      sources: sortByStability(sources),
    };
  }

  /** Probe each embed and store the verdict so ranking improves over time. */
  private async probeAndPersist(
    malId: number,
    sources: WatchSource[],
  ): Promise<void> {
    const queue = [...sources];
    const checkedAt = new Date();

    const worker = async () => {
      for (;;) {
        const source = queue.shift();
        if (!source) return;
        const ok = await probeEmbed(source.embedUrl);
        source.stable = ok;
        const { provider, sourceKey } = keyOf(source.id);
        // updateMany: a row may legitimately be gone (re-resolved meanwhile),
        // and a missing row must not blow up the probe pass.
        await this.prisma.playerSource
          .updateMany({
            where: { animeId: malId, provider, sourceKey },
            data: { stable: ok, stableAt: checkedAt },
          })
          .catch(() => undefined);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PROBE_CONCURRENCY, sources.length) }, worker),
    );
  }

  /** Alloha's payload turned into our source rows — shared by both call sites below. */
  private allohaResultToSources(result: AllohaResult): WatchSource[] {
    const perDub = Object.entries(result.translationIframes).slice(0, MAX_ALLOHA_DUBS);
    if (perDub.length === 0) {
      return [
        {
          id: "alloha:main",
          title: "Alloha (агрегатор)",
          kind: "unknown",
          embedUrl: result.iframe,
          quality: result.quality,
          episodesCount: null,
          stable: null,
        },
      ];
    }
    return perDub.map(([tid, iframe]) => ({
      id: `alloha:${tid}`,
      title: `${result.translations.find((t) => t.id === tid)?.name ?? `Озвучка ${tid}`} · Alloha`,
      kind: "voice" as const,
      embedUrl: iframe,
      quality: result.quality,
      episodesCount: null,
      stable: null,
    }));
  }

  private async fetchAlloha(
    kinopoiskId: number,
    malId: number,
    quiet: boolean,
  ): Promise<AllohaResult | null> {
    try {
      return await this.alloha.getByKinopoiskId(kinopoiskId);
    } catch (error) {
      if (!quiet) this.logger.warn({ error, malId }, "alloha lookup failed");
      return null;
    }
  }

  private async resolveAndPersist(
    malId: number,
    quiet = false,
  ): Promise<WatchResponse> {
    const sources: WatchSource[] = [];
    let provider: string | null = null;

    // A Kinopoisk id from a previous resolve lets Alloha run *alongside*
    // Kodik instead of waiting on it — on the common re-resolve path (every
    // RECHECK_MS) that halves the worst-case cold latency instead of
    // stacking both providers' timeouts back to back.
    const existing = await this.prisma.anime.findUnique({
      where: { id: malId },
      select: { kinopoiskId: true },
    });
    let kinopoiskId = existing?.kinopoiskId ?? null;
    const eagerAlloha =
      kinopoiskId != null ? this.fetchAlloha(kinopoiskId, malId, quiet) : null;

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

    // 2. Alloha — the concurrent lookup above if we had a Kinopoisk id
    // already, otherwise (first-ever resolve) fall back to a fresh one now
    // that Kodik may have just given us the id.
    const allohaResult =
      eagerAlloha != null
        ? await eagerAlloha
        : kinopoiskId != null
          ? await this.fetchAlloha(kinopoiskId, malId, quiet)
          : null;
    if (allohaResult) {
      sources.push(...this.allohaResultToSources(allohaResult));
      provider = provider ?? "alloha";
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
        stable: null,
      });
      provider = "custom";
    }

    await this.persist(malId, kinopoiskId, provider, sources);

    if (sources.length === 0) {
      return { available: false, reason: "not_found", provider: null, sources: [] };
    }

    // The warm pass can afford to wait for verdicts; a live request can't, so
    // it ships the static ranking now and improves on the next open.
    if (quiet) await this.probeAndPersist(malId, sources).catch(() => undefined);
    else void this.probeAndPersist(malId, sources).catch(() => undefined);

    return { available: true, reason: "ok", provider, sources: sortByStability(sources) };
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
          const { provider: prov, sourceKey } = keyOf(s.id);
          return {
            animeId: malId,
            provider: prov,
            sourceKey,
            title: s.title,
            kind: s.kind,
            embedUrl: s.embedUrl,
            quality: s.quality,
            episodesCount: s.episodesCount,
            position: index,
            stable: s.stable,
          };
        }),
        skipDuplicates: true,
      }),
    ]);
  }
}
