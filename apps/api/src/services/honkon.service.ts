import {
  groupByShikimori,
  toEpisodeMap,
  type KodikClient,
  type KodikResult,
} from "@animeshadow/kodik";
import type { FastifyBaseLogger } from "fastify";
import type { KodikCatalogSync } from "./kodik-sync.service.js";
import type { WatchService } from "./watch.service.js";
import { KodikStreams } from "./kodik-streams.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";
import type { ChannelVideo, StudioChannel } from "./studio-channel.js";

export const isStudioTrailer = (
  row: Pick<KodikResult, "title" | "title_orig" | "other_title">,
) =>
  /(?:трейлер|тизер|промо|trailer|teaser|\bPV\b|\bCM\b)/i.test(
    [row.title, row.title_orig, row.other_title].filter(Boolean).join(" "),
  );

/** One filtered provider index, shared by the studio catalogue, clips and audit. */
export class HonkonService {
  private rows: KodikResult[] = [];
  private channelVideos: ChannelVideo[] = [];
  private task: Promise<void> | null = null;
  private lastAttempt = 0;
  private updatedAt: string | null = null;
  private error = false;
  private auditedOnce = false;
  private auditState: {
    running: boolean;
    total: number;
    checked: number;
    failures: Array<{ id: string; title: string; episode: string }>;
  } = { running: false, total: 0, checked: 0, failures: [] };
  constructor(
    private readonly kodik: KodikClient,
    private readonly sync: Pick<KodikCatalogSync, "storeStudioGroups">,
    private readonly watch: Pick<WatchService, "importStudioSources">,
    private readonly logger: FastifyBaseLogger,
    private readonly streams: Pick<KodikStreams, "resolve"> = new KodikStreams(),
    private readonly channel?: Pick<StudioChannel, "getVideos">,
    private readonly resolveId?: (row: KodikResult) => Promise<number | null>,
  ) {}

  refresh(force = false): Promise<void> {
    if (this.task) return this.task;
    if (!force && Date.now() - this.lastAttempt < (this.error ? 60_000 : 10 * 60_000))
      return Promise.resolve();
    this.lastAttempt = Date.now();
    const catalogue = this.load().catch((error) => {
      this.error = true;
      this.logger.warn(
        { name: error instanceof Error ? error.name : "Error" },
        "Hon-Kon index temporarily unavailable; retaining previous releases",
      );
    });
    const channel = this.channel
      ?.getVideos()
      .then((videos) => {
        this.channelVideos = videos;
      })
      .catch(() => {
        this.logger.warn(
          "Hon-Kon public channel feed unavailable; retaining previous videos",
        );
      });
    this.task = Promise.all([catalogue, channel])
      .then(() => undefined)
      .finally(() => {
        this.task = null;
      });
    return this.task;
  }

  private async load() {
    const found = new Map<string, KodikResult>();
    let cursor: string | undefined;
    const visited = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const response = await this.kodik.listByTranslation(4167, cursor);
      for (const row of response.rows) found.set(row.id, row);
      if (!response.nextCursor) break;
      if (visited.has(response.nextCursor) || page === 19)
        throw new Error("Incomplete studio index");
      visited.add(response.nextCursor);
      cursor = response.nextCursor;
    }
    const rows = [...found.values()].filter((row) => {
      const md = row.material_data;
      return (
        (md?.rating_mpaa ?? "").toLowerCase() !== "rx" &&
        ![...(md?.anime_genres ?? []), ...(md?.genres ?? [])].some((name) =>
          /^(hentai|хентай)$/i.test(name),
        )
      );
    });
    for (const row of rows) {
      const id = Number(row.shikimori_id);
      if (
        (!Number.isSafeInteger(id) || id <= 0) &&
        !isStudioTrailer(row) &&
        this.resolveId
      ) {
        const match = await this.resolveId(row);
        if (match) row.shikimori_id = match;
      }
    }
    const groups = [
      ...groupByShikimori(rows.filter((row) => !isStudioTrailer(row))).values(),
    ];
    await this.sync.storeStudioGroups(groups);
    for (const group of groups) await this.watch.importStudioSources(group);
    this.rows = rows;
    this.updatedAt = new Date().toISOString();
    this.error = false;
    this.logger.info(
      { titles: groups.length, videos: rows.filter(isStudioTrailer).length },
      "Hon-Kon index synchronized",
    );
  }

  status() {
    return {
      pending: !!this.task,
      updatedAt: this.updatedAt,
      unavailable: this.error,
      indexed: this.rows.length,
      unmatched: this.rows
        .filter(
          (row) =>
            !Number.isSafeInteger(Number(row.shikimori_id)) ||
            Number(row.shikimori_id) <= 0,
        )
        .map((row) => ({ id: row.id, title: row.title, year: row.year ?? null })),
      health: {
        running: this.auditState.running,
        checked: this.auditState.checked,
        total: this.auditState.total,
        failed: this.auditState.failures.length,
      },
      uploads: this.rows
        .filter((row) => !isStudioTrailer(row) && !(Number(row.shikimori_id) > 0))
        .map((row) => {
          const episodes = Object.keys(toEpisodeMap(row))
            .map(Number)
            .filter((n) => Number.isSafeInteger(n) && n > 0)
            .sort((a, b) => a - b);
          return {
            id: row.id,
            title: row.title,
            image:
              row.material_data?.anime_poster_url ??
              row.material_data?.poster_url ??
              row.screenshots?.[0] ??
              null,
            episodes: episodes.length
              ? episodes
              : /\/video\//.test(row.link)
                ? [1]
                : [],
            stream: `/api/studios/hon-kon/uploads/${row.id}/episodes/`,
          };
        })
        .filter((row) => row.episodes.length > 0),
      videos: [
        ...this.rows.filter(isStudioTrailer).map((row) => ({
          id: row.id,
          title: row.title,
          image:
            row.screenshots?.[0] ??
            row.material_data?.anime_poster_url ??
            row.material_data?.poster_url ??
            null,
          stream: `/api/studios/hon-kon/clips/${row.id}/master.m3u8`,
        })),
        ...this.channelVideos,
      ],
    };
  }

  private link(row: KodikResult, episode = "1") {
    return (
      toEpisodeMap(row)[episode]?.url ??
      (episode === "1" && /\/video\//.test(row.link) ? row.link : null)
    );
  }

  async clip(id: string) {
    await this.refresh();
    const row = this.rows.find((row) => row.id === id && isStudioTrailer(row));
    const link = row && this.link(row);
    if (!link) throw new NotFoundError("Ролик студии не найден.");
    try {
      return await this.streams.resolve(link.startsWith("//") ? `https:${link}` : link);
    } catch {
      throw new UpstreamUnavailableError(
        "Ролик временно недоступен. Попробуйте позже.",
      );
    }
  }

  async upload(id: string, episode: string) {
    await this.refresh();
    const row = this.rows.find(
      (row) =>
        row.id === id && !isStudioTrailer(row) && !(Number(row.shikimori_id) > 0),
    );
    const link = row && this.link(row, episode);
    if (!link) throw new NotFoundError("Серия студии не найдена.");
    try {
      return await this.streams.resolve(link.startsWith("//") ? `https:${link}` : link);
    } catch {
      throw new UpstreamUnavailableError(
        "Серия временно недоступна. Попробуйте позже.",
      );
    }
  }

  auditStatus() {
    return {
      ...this.auditState,
      unavailable: this.error,
      failures: [...this.auditState.failures],
    };
  }
  auditOnce(): void {
    if (this.auditedOnce || this.error || !this.updatedAt) return;
    this.auditedOnce = true;
    void this.audit(false).catch(() => undefined);
  }

  async audit(refresh = true): Promise<void> {
    if (this.auditState.running) return;
    this.auditState = { running: true, total: 0, checked: 0, failures: [] };
    try {
      if (refresh) await this.refresh(true);
      const jobs = this.rows.flatMap((row) => {
        const episodes = toEpisodeMap(row);
        const pairs = Object.entries(episodes).map(([episode, entry]) => ({
          row,
          episode,
          link: entry.url,
        }));
        return pairs.length
          ? pairs
          : /\/video\//.test(row.link)
            ? [{ row, episode: "1", link: row.link }]
            : [];
      });
      this.auditState.total = jobs.length;
      let next = 0;
      await Promise.all(
        [0, 1].map(async () => {
          while (next < jobs.length) {
            const job = jobs[next++]!;
            try {
              await this.streams.resolve(
                job.link.startsWith("//") ? `https:${job.link}` : job.link,
              );
            } catch {
              this.auditState.failures.push({
                id: job.row.id,
                title: job.row.title,
                episode: job.episode,
              });
            }
            this.auditState.checked++;
          }
        }),
      );
    } finally {
      this.auditState.running = false;
    }
  }
}
