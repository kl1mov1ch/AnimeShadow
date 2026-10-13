import {
  adminAnalyticsQuerySchema,
  adminProActionSchema,
  adminProQuerySchema,
  adminBreakdownQuerySchema,
  adminCommentQuerySchema,
  adminMonitoringQuerySchema,
  adminReportQuerySchema,
  adminResolveReportsInputSchema,
  adminSetPasswordInputSchema,
  adminUpdateUserInputSchema,
  adminUserQuerySchema,
  adminVisitorsQuerySchema,
} from "@animeshadow/shared";
import { SECRET_RULES } from "../lib/secret-achievements.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listPro, setPro } from "../lib/admin-pro.js";
import { referralOverview } from "../lib/referral.js";
import { externalAnalytics } from "../lib/external-analytics.js";
import { parse } from "../lib/validation.js";

const idParams = z.object({ id: z.string().min(1) });

/** Every route here requires a fresh, DB-checked ADMIN role — see
 * requireAdmin in plugins/auth.ts. */
export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const { admin, comments, adminAnalytics } = fastify.services;
  const guard = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  // The page's header (tab badges, today's pills) — read on every tab.
  fastify.get("/admin/summary", guard, async () => admin.summary());

  // The overview, block by block: each is loaded when it comes into view
  // and cached on the server (see AdminService).
  fastify.get("/admin/overview", guard, async () => admin.overview());
  fastify.get("/admin/overview/timeline", guard, async () => admin.overviewTimeline());
  fastify.get("/admin/overview/top", guard, async () => admin.overviewTop());

  // The analytics tab: any period, filtered, with the previous period beside
  // it — the numbers and curve first, every other block its own request.
  fastify.get("/admin/analytics", guard, async (request) =>
    adminAnalytics.analytics(parse(adminAnalyticsQuerySchema, request.query)),
  );
  fastify.get("/admin/analytics/live", guard, async (request) =>
    adminAnalytics.live(parse(adminAnalyticsQuerySchema, request.query)),
  );
  fastify.get("/admin/analytics/heatmap", guard, async (request) =>
    adminAnalytics.heatmap(parse(adminAnalyticsQuerySchema, request.query)),
  );
  fastify.get("/admin/analytics/breakdowns", guard, async (request) =>
    adminAnalytics.breakdowns(parse(adminBreakdownQuerySchema, request.query)),
  );
  fastify.get("/admin/analytics/retention", guard, async (request) =>
    adminAnalytics.retention(parse(adminAnalyticsQuerySchema, request.query)),
  );
  // Past the raw page views' retention: the daily rollups, a month at a time.
  fastify.get("/admin/analytics/archive", guard, async () => adminAnalytics.archive());
  fastify.get("/admin/analytics/archive/:month", guard, async (request) => {
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), request.params);
    return adminAnalytics.archiveMonth(month);
  });
  fastify.get("/admin/analytics/visitors", guard, async (request) =>
    adminAnalytics.visitors(parse(adminVisitorsQuerySchema, request.query)),
  );
  fastify.get("/admin/analytics/visitors/:id", guard, async (request) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(100) }), request.params);
    return adminAnalytics.visitor(id);
  });
  fastify.get("/admin/analytics/external", guard, async () => externalAnalytics());

  // Live curves, read server-side from Prometheus — fixed panels only.
  fastify.get("/admin/monitoring", guard, async (request) => {
    const { range } = parse(adminMonitoringQuerySchema, request.query);
    return admin.monitoring(range);
  });

  fastify.get("/admin/users", guard, async (request) => {
    const query = parse(adminUserQuerySchema, request.query);
    return admin.listUsers(query);
  });

  fastify.patch("/admin/users/:id", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    const input = parse(adminUpdateUserInputSchema, request.body);
    return admin.updateUser(request.userId!, id, input);
  });

  // PRO accounts: the list with its counts, and one change at a time.
  fastify.get("/admin/pro", guard, async (request) => listPro(fastify.prisma, parse(adminProQuerySchema, request.query)));
  // Secret achievements: the rules (only ever sent here) and how many have each.
  fastify.get("/admin/achievements/secret", guard, async () => {
    const counts = await fastify.prisma.userAchievement.groupBy({
      by: ["achievementId"],
      where: { achievementId: { in: SECRET_RULES.map((r) => r.id) } },
      _count: { _all: true },
    });
    const by = new Map(counts.map((c) => [c.achievementId, c._count._all]));
    return { items: SECRET_RULES.map((r) => ({ ...r, earnedBy: by.get(r.id) ?? 0 })) };
  });

  // Invites: how many came by a friend's code, rewards taken, top inviters.
  fastify.get("/admin/referrals", guard, async () => referralOverview(fastify.prisma));
  fastify.post("/admin/pro/:id", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    const input = parse(adminProActionSchema, request.body);
    const row = await setPro(fastify.prisma, id, input);
    request.log.info({ adminId: request.userId, userId: id, action: input.action }, "admin changed a user's PRO");
    return row;
  });

  fastify.get("/admin/users/:id", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    return admin.userDetail(id);
  });

  fastify.post(
    "/admin/users/:id/password",
    // Tighter than the admin routes' default: this is the one that hands
    // over an account, so a leaked admin session should not get to brute
    // through many of them quickly.
    { ...guard, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const { id } = parse(idParams, request.params);
      const { password } = parse(adminSetPasswordInputSchema, request.body);
      return admin.setPassword(request.userId!, id, password);
    },
  );

  fastify.get("/admin/comments", guard, async (request) => {
    const query = parse(adminCommentQuerySchema, request.query);
    return admin.listComments(query);
  });

  fastify.get("/admin/reports", guard, async (request) => {
    const query = parse(adminReportQuerySchema, request.query);
    return admin.listReports(query);
  });

  // The decision closes every open complaint about the profile.
  fastify.post("/admin/reports/:id/resolve", guard, async (request) => {
    const { id } = parse(idParams, request.params);
    const input = parse(adminResolveReportsInputSchema, request.body);
    return admin.resolveReports(request.userId!, id, input);
  });

  fastify.delete("/admin/comments/:id", guard, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await comments.adminRemove(id);
    reply.code(204);
  });
};
