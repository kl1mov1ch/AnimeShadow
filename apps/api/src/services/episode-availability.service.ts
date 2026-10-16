import type { PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";
import type { NotificationService } from "./notification.service.js";
import type { WatchService } from "./watch.service.js";

/** Observe playable episodes, independently of broadcast dates and metadata totals. */
export class EpisodeAvailabilityService {
  private running = false;
  private cursor = 0;
  constructor(private readonly prisma: PrismaClient, private readonly watch: WatchService,
    private readonly notifications: NotificationService, private readonly log: FastifyBaseLogger) {}

  async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [library, guests] = await Promise.all([
        this.prisma.libraryEntry.findMany({ where: { status: { in: ["WATCHING", "PLANNED", "ON_HOLD"] } }, select: { animeId: true }, distinct: ["animeId"] }),
        this.prisma.guestWatchSession.findMany({ where: { startedAt: { gte: new Date(Date.now() - 60 * 86_400_000) } }, select: { animeId: true }, distinct: ["animeId"] }),
      ]);
      const ids = [...new Set([...library, ...guests].map((r) => r.animeId))].sort((a, b) => a - b);
      // Round-robin batches: background checks cannot monopolise provider APIs.
      const remaining = ids.filter((id) => id > this.cursor);
      const batch = (remaining.length ? remaining : ids).slice(0, 100);
      const marks = await this.prisma.episodeMark.findMany({ where: { animeId: { in: batch } } });
      const before = new Map(marks.map((row) => [row.animeId, row.latest]));
      for (const id of batch) {
        try {
          const latest = await this.watch.latestPlayableEpisode(id, before.get(id) ?? -1);
          if (latest != null) await this.notifications.observe(new Map([[id, latest]]));
        } catch (error) { this.log.warn({ animeId: id, err: error }, "playable episode check failed"); }
      }
      this.cursor = batch.at(-1) ?? 0;
    } catch (error) { this.log.warn({ err: error }, "episode availability check failed"); }
    finally { this.running = false; }
  }
}
