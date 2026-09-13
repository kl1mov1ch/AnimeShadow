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
  }
}
