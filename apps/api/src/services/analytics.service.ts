import type { PrismaClient } from "@animeshadow/db";
import type { PageViewInput } from "@animeshadow/shared";

export interface AnalyticsServiceDeps {
  prisma: PrismaClient;
}

export class AnalyticsService {
  private readonly prisma: PrismaClient;

  constructor(deps: AnalyticsServiceDeps) {
    this.prisma = deps.prisma;
  }

  async record(input: PageViewInput, userId?: string): Promise<void> {
    await this.prisma.pageView.create({
      data: {
        path: input.path,
        referrer: input.referrer || null,
        visitorId: input.visitorId,
        userId: userId ?? null,
      },
    });
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
}
