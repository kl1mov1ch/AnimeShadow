import type { PrismaClient } from "@animeshadow/db";
import type { PageLeaveInput, PageViewInput } from "@animeshadow/shared";
import { parseUserAgent } from "../lib/user-agent.js";
import { animeViewsTotal, pageviewsTotal } from "../lib/metrics.js";

export interface AnalyticsServiceDeps {
  prisma: PrismaClient;
}

export class AnalyticsService {
  private readonly prisma: PrismaClient;

  constructor(deps: AnalyticsServiceDeps) {
    this.prisma = deps.prisma;
  }

  async record(input: PageViewInput, userId?: string, userAgent?: string): Promise<void> {
    const agent = parseUserAgent(userAgent);
    const data = {
      path: input.path,
      referrer: input.referrer || null,
      visitorId: input.visitorId,
      userId: userId ?? null,
      clientId: input.clientId || null,
      sessionId: input.sessionId || null,
      entry: input.entry ?? false,
      sessionRef: input.sessionRef || null,
      device: agent.device,
      browser: agent.browser,
      os: agent.os,
      lang: input.lang?.slice(0, 2).toLowerCase() || null,
      screenW: input.screenW ?? null,
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
    };
    try {
      await this.prisma.pageView.create({ data });
    } catch {
      // A repeated clientId (a retried beacon): the view is already counted.
      return;
    }
    const audience = userId ? "registered" : "guest";
    pageviewsTotal.inc({ audience });
    if (input.path.startsWith("/anime/")) animeViewsTotal.inc({ audience });
    if (userId) {
      // At most one write a minute per user: "last seen" needs minutes of
      // precision, not a row update on every click.
      await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }],
        },
        data: { lastSeenAt: new Date() },
      });
    }
  }

  /** How long a page was looked at — only ever filled in once, and only by
   *  the browser that reported the view. */
  async leave(input: PageLeaveInput): Promise<void> {
    await this.prisma.pageView.updateMany({
      where: { clientId: input.clientId, visitorId: input.visitorId, durationMs: null },
      data: { durationMs: input.durationMs },
    });
  }
}
