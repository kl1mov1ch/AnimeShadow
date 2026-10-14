import type { PrismaClient } from "@animeshadow/db";
import type { EpisodeGrowth, EpisodeNews } from "./delivery.service.js";
import type { AppNotification } from "@animeshadow/shared";
import type { FastifyBaseLogger } from "fastify";

/** Lists whose owners hear about new episodes. */
const LISTENING = ["WATCHING", "PLANNED", "ON_HOLD"] as const;

/**
 * New episodes, told to the people waiting for them. The Kodik checks hand
 * in each title's newest episode; the first time a title is seen that only
 * sets its mark, after that a higher number is a new episode and everyone
 * with the title in "watching", "planned" or "on hold" gets one line
 * (several episodes at once are one line, "3–5"). Unread ones are counted
 * by an index, so the bell in the header costs a single cheap query.
 */
export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly log: FastifyBaseLogger,
    /** Told of every batch written — Telegram and push go out from there. */
    private readonly onCreated?: (items: EpisodeNews[]) => Promise<void>,
    /** Told of every title that grew — guests' browsers are pushed from there. */
    private readonly onGrown?: (grown: EpisodeGrowth[]) => Promise<void>,
  ) {}

  /** Each title's newest episode, as a source reports it. Returns how many notifications went out. */
  async observe(latest: Map<number, number>): Promise<number> {
    const entries = [...latest].filter(([, ep]) => Number.isInteger(ep) && ep > 0);
    if (entries.length === 0) return 0;
    const ids = entries.map(([id]) => id);
    const [marks, known] = await Promise.all([
      this.prisma.episodeMark.findMany({ where: { animeId: { in: ids } } }),
      this.prisma.anime.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    ]);
    const exists = new Set(known.map((a) => a.id));
    const mark = new Map(marks.map((m) => [m.animeId, m.latest]));
    const fresh: Array<{ animeId: number; latest: number }> = [];
    const grown: Array<{ animeId: number; from: number; to: number }> = [];
    for (const [animeId, ep] of entries) {
      if (!exists.has(animeId)) continue;
      const before = mark.get(animeId);
      if (before == null) fresh.push({ animeId, latest: ep });
      else if (ep > before) grown.push({ animeId, from: before + 1, to: ep });
    }
    if (fresh.length > 0) await this.prisma.episodeMark.createMany({ data: fresh, skipDuplicates: true });
    if (grown.length === 0) return 0;
    await this.prisma.$transaction(grown.map((g) => this.prisma.episodeMark.update({ where: { animeId: g.animeId }, data: { latest: g.to } })));

    const listeners = await this.prisma.libraryEntry.findMany({
      where: { animeId: { in: grown.map((g) => g.animeId) }, status: { in: [...LISTENING] } },
      select: { userId: true, animeId: true },
    });
    const byAnime = new Map(grown.map((g) => [g.animeId, g]));
    const data = listeners.map((l) => {
      const g = byAnime.get(l.animeId)!;
      return { userId: l.userId, animeId: l.animeId, episode: g.to, fromEpisode: g.from < g.to ? g.from : null };
    });
    if (data.length > 0) await this.prisma.notification.createMany({ data, skipDuplicates: true });
    this.log.info({ titles: grown.length, sent: data.length }, "new episode notifications");
    if (this.onGrown) {
      void this.onGrown(grown).catch((error: unknown) => this.log.warn({ err: (error as Error).message }, "guest push failed"));
    }
    if (data.length > 0 && this.onCreated) {
      void this.onCreated(data).catch((error: unknown) => this.log.warn({ err: (error as Error).message }, "delivery failed"));
    }
    return data.length;
  }

  async list(userId: string, limit = 40): Promise<{ items: AppNotification[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
      this.unread(userId),
    ]);
    const anime = rows.length
      ? await this.prisma.anime.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.animeId))] } },
          select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true },
        })
      : [];
    const byId = new Map(anime.map((a) => [a.id, a]));
    return {
      unread,
      items: rows
        .filter((r) => byId.has(r.animeId))
        .map((r) => ({
          id: r.id,
          kind: "episode" as const,
          anime: byId.get(r.animeId)!,
          episode: r.episode,
          fromEpisode: r.fromEpisode,
          createdAt: r.createdAt.toISOString(),
          read: r.readAt != null,
        })),
    };
  }

  unread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, input: { ids?: string[]; animeId?: number }): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(input.ids ? { id: { in: input.ids } } : {}),
        ...(input.animeId ? { animeId: input.animeId } : {}),
      },
      data: { readAt: new Date() },
    });
    return count;
  }

  /** Read ones after a month, any after three — the table stays small. */
  async prune(): Promise<number> {
    const day = 86_400_000;
    const { count } = await this.prisma.notification.deleteMany({
      where: {
        OR: [
          { readAt: { lt: new Date(Date.now() - 30 * day) } },
          { createdAt: { lt: new Date(Date.now() - 90 * day) } },
        ],
      },
    });
    return count;
  }
}
