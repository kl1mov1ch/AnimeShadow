import { Prisma, type PrismaClient } from "@animeshadow/db";
import {
  type KodikClient,
  toWatchSources as kodikToSources,
} from "@animeshadow/kodik";
import type { AllohaClient, AllohaResult } from "@animeshadow/alloha";
import { type AniLibriaClient, bestEpisodeUrl } from "@animeshadow/anilibria";
import type { WatchResponse, WatchSource } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { withTimeout } from "../lib/timeout.js";
import type { DirectSources } from "./direct-sources.js";
import { KodikStreams, kodikCustomSource } from "./kodik-streams.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";
import { AnimeVostSources } from "./animevost-sources.js";

interface WatchLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface WatchServiceDeps {
  prisma: PrismaClient;
  kodik: KodikClient;
  alloha: AllohaClient;
  anilibria: AniLibriaClient;
  embedTemplate?: string | undefined;
  directSources?: Pick<DirectSources, "getSources" | "invalidate">;
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
/**
 * Rows written before per-episode embed URLs and stills existed.
 *
 * A stored source is a cache of what a provider told us, so widening what
 * we ask the provider for has to invalidate it — otherwise the new fields
 * only appear on titles that happen to fall out of the 3-day re-resolve
 * window, which for a popular title could be never. This is a date rather
 * than a "is the field empty" test on purpose: plenty of sources genuinely
 * have no per-episode data (Alloha never does, films often don't), and
 * re-resolving those forever would be a refresh loop, not a cache.
 *
 * Bump this whenever a provider fetch starts asking for something new.
 */
const SOURCE_SCHEMA_SINCE = Date.parse("2026-09-24T00:00:00Z");
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_CONCURRENCY = 4;

/** Dub studios that have historically been the least flaky — a nudge, not a gate. */
const TRUSTED_STUDIOS =
  /anilibria|animevost|shiza|studio.?band|dreamcast|anidub|jam.?club|kodik/i;

/**
 * How good a source is as the *default* pick. Our own HLS player (AniLibria,
 * currently the only "hls" format) leads outright whenever it isn't
 * confirmed dead — no third-party iframe UI to get stuck inside, so it
 * outranks even a merely-probed-stable Kodik/Alloha mirror, not just an
 * untested one. Only once it's actually confirmed unreachable does it drop
 * behind, same as any other dead source. After that: verified-reachable
 * beats everything, then Kodik (best anime coverage), then Alloha; a real
 * dub over subs, fuller episode lists, and studios that tend to stay up.
 */
function rankSource(s: WatchSource): number {
  let score = 0;
  if (s.format === "hls" && s.stable !== false) score += 2000;
  if (s.stable === true) score += 1000;
  else if (s.stable === false) score -= 1000;

  const provider = s.id.split(":")[0] ?? "";
  if (provider === "anilibria") score += 150;
  else if (provider === "kodik") score += 100;
  else if (provider === "alloha") score += 50;
  else score += 10;

  if (s.kind === "voice") score += 30;
  else if (s.kind === "subtitles") score += 15;

  if (TRUSTED_STUDIOS.test(s.title)) score += 25;
  score += Math.min(s.episodesCount ?? 0, 50);
  return score;
}

/** Where reachability actually needs checking: the iframe itself, or — for
 * an HLS source, which has no single "the embed" URL — one representative
 * episode manifest (its first). If that CDN path is up, the rest almost
 * certainly are too; they're served from the same host per release. */
function probeUrlOf(s: WatchSource): string | null {
  if (s.format === "hls") {
    const first = s.hlsEpisodes ? Object.values(s.hlsEpisodes)[0] : undefined;
    return first ?? null;
  }
  return s.embedUrl;
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
async function probeEmbed(url: string): Promise<boolean | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (AnimeShadow player check)" },
    });
    if (response.ok) {
      // Drain nothing; just release the socket.
      void response.body?.cancel();
      return true;
    }
    // Kodik answers 500 "not allowed in this country" to any address it
    // geo-blocks — this server's included, when it sits behind a VPN or
    // abroad. That says where *we* are, not whether the mirror works, and
    // recording it marked every Kodik source dead at once. No verdict.
    const body = await response.text().catch(() => "");
    if (/запрещено к просмотру в данной стране|not available in your country/i.test(body)) return null;
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves playable sources for an anime across providers — AniLibria first
 * when it has the title (a direct HLS stream, no third-party iframe UI to
 * get stuck inside), then Kodik (best anime coverage + RU dubs), then Alloha
 * as a fallback aggregator. Results are cached in `PlayerSource` so the
 * detail page renders without a live call, and `WatchAvailability` lets the
 * catalogue badge cards.
 */
export class WatchService {
  private readonly prisma: PrismaClient;
  private readonly kodik: KodikClient;
  private readonly alloha: AllohaClient;
  private readonly anilibria: AniLibriaClient;
  private readonly embedTemplate?: string;
  private readonly kodikStreams = new KodikStreams();
  private readonly animevost: AnimeVostSources;
  private readonly logger: WatchLogger;
  private readonly directSources: Pick<DirectSources, "getSources" | "invalidate"> | undefined;
  private readonly refreshCache = new TtlCache<WatchResponse>(30_000, 512);
  private readonly cache = new TtlCache<WatchResponse>(30 * 60_000, 512);
  // Anime ids currently being refreshed in the background — so a stale
  // cache hit doesn't fire a duplicate full re-resolve on every request that
  // lands while the first refresh is still in flight.
  private readonly refreshingIds = new Set<number>();

  constructor(deps: WatchServiceDeps) {
    this.prisma = deps.prisma;
    this.animevost = new AnimeVostSources(deps.prisma, deps.logger);
    this.kodik = deps.kodik;
    this.alloha = deps.alloha;
    this.anilibria = deps.anilibria;
    this.embedTemplate = deps.embedTemplate;
    this.logger = deps.logger;
    this.directSources = deps.directSources;
  }

  async getSources(malId: number): Promise<WatchResponse> {
    const vostRequest = this.animevost.getSources(malId);
    let basePending = true;
    const baseRequest = this.cache.wrap(String(malId), async () => {
      const cached = await this.readCached(malId);
      if (cached) return cached;
      return this.resolveAndPersist(malId);
    }).finally(() => { basePending = false; });
    // A cold/slow catalogue provider must not hold a ready alternative hostage.
    // The shared lookup continues; the client briefly polls sourcesPending.
    const [base, direct] = await Promise.all([
      withTimeout<WatchResponse>(baseRequest, 1200, { available: false, reason: "provider_error", provider: null, sources: [] }),
      this.directSources?.getSources(malId) ?? Promise.resolve([]),
    ]);
    const vost = await withTimeout(vostRequest, base.available ? 500 : 5000, []);
    if (!base.available || base.reason === "provider_error") this.cache.delete(String(malId));
    // Signed feeds have their own short cache and never enter the 3-day DB cache.
    const custom = base.sources.flatMap((source) => {
      if (source.format === "hls") return [source];
      if (keyOf(source.id).provider !== "kodik") return [];
      const mapped = kodikCustomSource(malId, source);
      return mapped ? [mapped] : [];
    });
    const vostPublic = vost.map((source) => ({ ...source, mediaEpisodes: Object.fromEntries(
      Object.keys(source.mediaEpisodes ?? {}).map((episode) => [episode,
        `/api/anime/${malId}/streams/animevost/${keyOf(source.id).sourceKey}/${episode}/video.mp4`]),
    ) }));
    const sources = sortByStability([...direct, ...custom, ...vostPublic]);
    if (vost.length && custom.length === 0) {
      await this.prisma.watchAvailability.updateMany({ where: { animeId: malId }, data: { hasPlayer: true, hasCustomPlayer: true } });
    }
    return { sourcesPending: basePending || this.animevost.pending(malId), available: sources.length > 0,
      reason: sources.length > 0 ? "ok" : base.reason === "provider_error" ? "provider_error" : "not_found",
      provider: sources[0]?.id.split(":")[0] ?? null, sources };
  }

  /** Refresh the site's source list first, then confirm a newly available playlist. */
  async getAnimeVostStream(malId: number, releaseId: string, episode: number): Promise<string> {
    const sources = await this.animevost.getSources(malId);
    const url = sources.find((source) => source.id === `animevost:${releaseId}`)?.mediaEpisodes?.[String(episode)];
    if (!url) throw new NotFoundError("Поток этой серии не найден.");
    return url;
  }

  async latestPlayableEpisode(malId: number, after: number): Promise<number | null> {
    const response = await this.refreshSources(malId);
    const episodes = [...new Set(response.sources.flatMap((source) => Object.keys(source.hlsEpisodes ?? source.mediaEpisodes ?? {}).map(Number)))]
      .filter((ep) => Number.isInteger(ep) && ep > after && ep > 0).sort((a, b) => b - a);
    if (!response.available) return after < 0 && response.reason === "not_found" && !response.sourcesPending ? 0 : null;
    for (const episode of episodes.slice(0, 3)) {
      for (const source of response.sources) {
        let url = (source.hlsEpisodes ?? source.mediaEpisodes)?.[String(episode)];
        if (!url) continue;
        try {
          if (keyOf(source.id).provider === "kodik") {
            const { variants } = await this.getKodikStreams(malId, keyOf(source.id).sourceKey, episode);
            url = Object.values(variants)[0];
          } else if (keyOf(source.id).provider === "animevost") {
            url = await this.getAnimeVostStream(malId, keyOf(source.id).sourceKey, episode);
          }
          if (!url || !url.startsWith("https://")) continue;
          if (source.format === "mp4") {
            const video = await fetch(url, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(6000), redirect: "error" });
            void video.body?.cancel();
            if (video.ok && video.headers.get("content-type")?.startsWith("video/")) return episode;
            continue;
          }
          const playlist = await fetch(url, { signal: AbortSignal.timeout(6000) });
          const body = await playlist.text();
          if (playlist.ok && body.trimStart().startsWith("#EXTM3U")) return episode;
        } catch { /* Another studio/provider may already have this episode. */ }
      }
    }
    return null;
  }

  /** Lookup by stored identity, never by a caller-supplied upstream URL. */
  async getKodikStreams(malId: number, translationId: string, episode: number) {
    let row = await this.prisma.playerSource.findUnique({
      where: { animeId_provider_sourceKey: { animeId: malId, provider: "kodik", sourceKey: translationId } },
    });
    if (!row) {
      await this.getSources(malId);
      row = await this.prisma.playerSource.findUnique({
        where: { animeId_provider_sourceKey: { animeId: malId, provider: "kodik", sourceKey: translationId } },
      });
    }
    if (!row) throw new NotFoundError("Озвучка не найдена.");
    const episodes = row.iframeEpisodes as WatchSource["iframeEpisodes"];
    const link = episodes?.[String(episode)]?.url ??
      (episode === 1 && (!episodes || Object.keys(episodes).length === 0) ? row.embedUrl : null);
    if (!link) throw new NotFoundError("Этой серии нет в выбранной озвучке.");
    try {
      return await this.kodikStreams.resolve(link);
    } catch {
      this.logger.warn({ malId, translationId, episode }, "kodik stream unavailable");
      throw new UpstreamUnavailableError("Источник временно не отдаёт поток. Попробуйте другую озвучку или повторите загрузку.");
    }
  }

  /** Explicit recovery refresh; coalesced and limited to one per title / 30s. */
  async refreshSources(malId: number): Promise<WatchResponse> {
    return this.refreshCache.wrap(String(malId), async () => {
      this.kodikStreams.invalidate();
      const base = await this.resolveAndPersist(malId);
      this.cache.set(String(malId), base);
      this.directSources?.invalidate(malId);
      this.animevost.invalidate(malId);
      return this.getSources(malId);
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
          // Known to be playable (the Kodik catalogue sync) but its dubs not
          // resolved yet: doing it here makes the first open instant.
          { watchAvailability: { hasPlayer: true }, playerSources: { none: {} } },
          // Matched to an AniLibria release by the catalogue sync, stream
          // not fetched yet: so the title opens in our player the first time.
          { watchAvailability: { anilibriaId: { not: null } }, playerSources: { none: { format: "hls" } } },
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
        // The response cache still holds what was served before this
        // refresh; without dropping it, the refreshed rows would only
        // reach viewers once it expires half an hour later.
        .then(() => this.cache.delete(String(malId)))
        .catch(() => undefined)
        .finally(() => this.refreshingIds.delete(malId));
    }

    if (!availability.hasPlayer) {
      // A title can gain its first episode today; a negative lookup must
      // not hide it for the normal three-day positive-cache lifetime.
      if (Date.now() - availability.checkedAt.getTime() > 10 * 60_000) return null;
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
      format: (r.format as WatchSource["format"]) ?? "iframe",
      embedUrl: r.embedUrl,
      hlsEpisodes:
        r.hlsEpisodes != null
          ? (r.hlsEpisodes as Record<string, string>)
          : undefined,
      hlsVariants:
        r.hlsVariants != null
          ? (r.hlsVariants as Record<string, Record<string, string>>)
          : undefined,
      iframeEpisodes:
        r.iframeEpisodes != null
          ? (r.iframeEpisodes as WatchSource["iframeEpisodes"])
          : undefined,
      episodeMeta:
        r.episodeMeta != null
          ? (r.episodeMeta as WatchSource["episodeMeta"])
          : undefined,
      quality: r.quality,
      episodesCount: r.episodesCount,
      stable: r.stable,
    }));

    // Matched to an AniLibria release by the catalogue sync, but its stream
    // isn't stored yet: fetched now — one request by id, a short deadline —
    // and kept, so the title opens in our own player this very time.
    if (availability.anilibriaId != null && !rows.some((r) => r.format === "hls")) {
      const own = await withTimeout(this.fetchAnilibria(malId, [], true, availability.anilibriaId), 3_000, null);
      if (own) {
        sources.push(own);
        void this.addSource(malId, own, rows.length).catch(() => undefined);
      }
    }

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

    // Written before we knew to ask for per-episode data — re-resolve once,
    // in the background, so the *next* open has episode stills. Guarded by
    // the same in-flight set as the age-based refresh above so the two can
    // never run at each other.
    //
    // A direct-stream row with no episode metadata is stale by definition:
    // since that field existed, every AniLibria row is written with an
    // entry per episode. Testing for the field itself rather than a date is
    // exact — a date cutoff either misses rows written between the change
    // and the deploy, or, set a little ahead, re-resolves on every single
    // open until the clock catches up.
    // The same goes for one written before qualities were kept per episode:
    // without them the player has no quality menu to offer.
    if (
      (rows.some((r) => r.updatedAt.getTime() < SOURCE_SCHEMA_SINCE) ||
        rows.some((r) => r.format === "hls" && (r.episodeMeta == null || r.hlsVariants == null))) &&
      !this.refreshingIds.has(malId)
    ) {
      this.refreshingIds.add(malId);
      void this.resolveAndPersist(malId, true)
        // The response cache still holds what was served before this
        // refresh; without dropping it, the refreshed rows would only
        // reach viewers once it expires half an hour later.
        .then(() => this.cache.delete(String(malId)))
        .catch(() => undefined)
        .finally(() => this.refreshingIds.delete(malId));
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
        const url = probeUrlOf(source);
        const verdict = url != null ? await probeEmbed(url) : false;
        // Geo-blocked from here: keep whatever we knew before.
        if (verdict == null) continue;
        const ok = verdict;
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
          format: "iframe",
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
      format: "iframe" as const,
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

  /** AniLibria's release, if it has one, turned into a single HLS source. */
  private async fetchAnilibria(
    malId: number,
    titles: string[],
    quiet: boolean,
    releaseId: number | null = null,
  ): Promise<WatchSource | null> {
    try {
      // By id when the catalogue sync has matched the title — one request,
      // no guessing — and by name search otherwise.
      const release =
        (releaseId != null ? await this.anilibria.releaseById(releaseId) : null) ??
        (titles.length > 0 ? await this.anilibria.findByMalId(titles, malId) : null);
      if (!release || release.episodes.length === 0) return null;

      const hlsEpisodes: Record<string, string> = {};
      const hlsVariants: Record<string, Record<string, string>> = {};
      const episodeMeta: NonNullable<WatchSource["episodeMeta"]> = {};
      for (const episode of release.episodes) {
        const url = bestEpisodeUrl(episode);
        if (!url) continue;
        const key = String(episode.ordinal);
        hlsEpisodes[key] = url;
        const variants: Record<string, string> = {};
        if (episode.hls480) variants["480"] = episode.hls480;
        if (episode.hls720) variants["720"] = episode.hls720;
        if (episode.hls1080) variants["1080"] = episode.hls1080;
        hlsVariants[key] = variants;
        episodeMeta[key] = {
          title: episode.name,
          titleEn: episode.nameEnglish,
          durationSeconds: episode.durationSeconds,
          thumb: episode.thumb,
          opening: episode.opening,
        };
      }
      if (Object.keys(hlsEpisodes).length === 0) return null;

      return {
        id: "anilibria:main",
        title: "AniLibria",
        kind: "voice",
        format: "hls",
        embedUrl: "",
        hlsEpisodes,
        hlsVariants,
        episodeMeta,
        quality: "HD",
        episodesCount: release.episodesTotal,
        stable: null,
      };
    } catch (error) {
      if (!quiet) this.logger.warn({ error, malId }, "anilibria lookup failed");
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
    // stacking both providers' timeouts back to back. AniLibria has no such
    // dependency (it matches by name + its own reported MAL id), so it
    // starts right away too.
    const existing = await this.prisma.anime.findUnique({
      where: { id: malId },
      select: { kinopoiskId: true, title: true, titleEnglish: true, titleLocalized: true, year: true },
    });
    let kinopoiskId = existing?.kinopoiskId ?? null;
    const eagerAlloha =
      kinopoiskId != null ? this.fetchAlloha(kinopoiskId, malId, quiet) : null;
    const titles = [existing?.titleLocalized, existing?.title, existing?.titleEnglish].filter(
      (t): t is string => Boolean(t),
    );
    const releaseId =
      (await this.prisma.watchAvailability.findUnique({ where: { animeId: malId }, select: { anilibriaId: true } }))
        ?.anilibriaId ?? null;
    // Hard cap on top of the client's own per-request timeouts: trying up to
    // three title variants, each with its own search-then-detail round trip,
    // could otherwise stack into tens of seconds if AniLibria itself is slow
    // rather than cleanly erroring. A missing bonus source is nothing; a
    // stuck watch-sources response is exactly the kind of hang this whole
    // feature was asked not to reintroduce.
    const eagerAnilibria =
      titles.length > 0 || releaseId != null
        ? withTimeout(this.fetchAnilibria(malId, titles, quiet, releaseId), 6_000, null)
        : null;

    // 1. Kodik
    let kodikFailed = false;
    try {
      // By Shikimori id first; a fresh release may not carry it yet on
      // Kodik's side, so then by name (same year, no other title's id).
      const group =
        (await this.kodik.getByShikimoriId(malId)) ??
        (titles.length > 0 ? await withTimeout(this.kodik.findByTitles(malId, titles, existing?.year ?? null), 6_000, null) : null);
      if (group) {
        const kp = Number(group.primary.kinopoisk_id);
        if (Number.isInteger(kp) && kp > 0) kinopoiskId = kp;
        for (const s of kodikToSources(group)) {
          // Keep provider episode addresses internally. getSources exposes
          // stable HLS endpoints; signed links are resolved on demand.
          sources.push(s);
        }
        if (sources.length > 0) provider = "kodik";
      }
    } catch (error) {
      kodikFailed = true;
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

    // 3. AniLibria — ranks above both when reachable (see rankSource), so
    // this only actually changes what plays if it turns out stable; the
    // moment it doesn't (or it never had this title), Kodik/Alloha are
    // already sitting right there, no extra round-trip needed.
    const anilibriaSource = eagerAnilibria != null ? await eagerAnilibria : null;
    if (anilibriaSource) {
      sources.push(anilibriaSource);
      provider = provider ?? "anilibria";
    }

    // 4. Custom template fallback
    if (sources.length === 0 && this.embedTemplate) {
      sources.push({
        id: "custom:0",
        title: "Плеер",
        kind: "unknown",
        format: "iframe",
        embedUrl: this.embedTemplate.replace(/\{mal_?id\}/gi, String(malId)),
        quality: null,
        episodesCount: null,
        stable: null,
      });
      provider = "custom";
    }

    // A lookup that failed is not an answer. When Kodik errored (a timeout,
    // an outage) and this pass found less than is already stored, what is
    // stored stays: overwriting it would take the player off a title over a
    // network hiccup — every title a background refresh touched during an
    // outage used to end up "no player found" until its next recheck.
    if (kodikFailed) {
      const stored = await this.prisma.playerSource.count({ where: { animeId: malId } });
      if (stored > sources.length) {
        this.logger.warn({ malId, stored, found: sources.length }, "watch refresh incomplete — keeping stored sources");
        // Rechecked later, on the usual schedule, rather than on every open.
        await this.prisma.watchAvailability
          .update({ where: { animeId: malId }, data: { checkedAt: new Date() } })
          .catch(() => undefined);
        const kept = await this.readCached(malId);
        if (kept) return kept;
      }
    }

    if (kodikFailed && sources.length === 0) return { available: false, reason: "provider_error", provider: null, sources: [] };
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

  /** One more source for a title, kept next to the ones already stored. */
  private async addSource(malId: number, source: WatchSource, position: number): Promise<void> {
    const { provider, sourceKey } = keyOf(source.id);
    const data = {
      title: source.title,
      kind: source.kind,
      format: source.format,
      embedUrl: source.embedUrl,
      hlsEpisodes: source.hlsEpisodes ?? Prisma.JsonNull,
      hlsVariants: source.hlsVariants ?? Prisma.JsonNull,
      iframeEpisodes: source.iframeEpisodes ?? Prisma.JsonNull,
      episodeMeta: source.episodeMeta ?? Prisma.JsonNull,
      quality: source.quality,
      episodesCount: source.episodesCount,
      position,
      stable: source.stable,
    };
    await this.prisma.playerSource.upsert({
      where: { animeId_provider_sourceKey: { animeId: malId, provider, sourceKey } },
      create: { animeId: malId, provider, sourceKey, ...data },
      update: data,
    });
    if (source.format === "hls") {
      await this.prisma.watchAvailability.update({ where: { animeId: malId }, data: { hasCustomPlayer: true } });
    }
  }

  private async persist(
    malId: number,
    kinopoiskId: number | null,
    provider: string | null,
    sources: WatchSource[],
  ): Promise<void> {
    // "Own player" means a direct stream we render ourselves (currently
    // only AniLibria's HLS) — independent of which provider `rankSource`
    // happens to pick as the default, and independent of `provider` above
    // (which only ever records whichever provider resolved *first*).
    const hasCustomPlayer = sources.some((s) => s.format === "hls" ||
      (keyOf(s.id).provider === "kodik" && kodikCustomSource(malId, s) != null));
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
            hasCustomPlayer,
          },
          update: {
            hasPlayer: sources.length > 0,
            sourceCount: sources.length,
            provider,
            hasCustomPlayer,
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
            format: s.format,
            embedUrl: s.embedUrl,
            hlsEpisodes: s.hlsEpisodes ?? Prisma.JsonNull,
            hlsVariants: s.hlsVariants ?? Prisma.JsonNull,
            iframeEpisodes: s.iframeEpisodes ?? Prisma.JsonNull,
            episodeMeta: s.episodeMeta ?? Prisma.JsonNull,
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
