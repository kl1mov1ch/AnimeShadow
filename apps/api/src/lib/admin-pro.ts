import type { Prisma, PrismaClient } from "@animeshadow/db";
import {
  type AdminProAction,
  type AdminProQuery,
  type AdminProRow,
  type AdminProStats,
  paginated,
  type Paginated,
  PROMO,
  type ProStatus,
} from "@animeshadow/shared";
import { NotFoundError } from "./errors.js";
import { addProDays } from "./pro.js";

const DAY = 86_400_000;

const ROW_SELECT = {
  id: true,
  displayName: true,
  email: true,
  username: true,
  avatarUrl: true,
  createdAt: true,
  proSince: true,
  trialUntil: true,
  proUntil: true,
  bonusReferrals: true,
} satisfies Prisma.UserSelect;
type Row = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

function statusOf(u: { proSince: Date | null; proUntil: Date | null; trialUntil: Date | null }, now: Date): ProStatus {
  if (u.proSince && (!u.proUntil || u.proUntil > now)) return "pro";
  if (!u.trialUntil) return "free";
  if (u.trialUntil > now) return "trial";
  if (u.trialUntil.getTime() + PROMO.discountDays * DAY > now.getTime()) return "discount";
  return "used";
}

function toRow(u: Row, now: Date): AdminProRow {
  return {
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    username: u.username,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    proSince: u.proSince?.toISOString() ?? null,
    proUntil: u.proUntil?.toISOString() ?? null,
    trialUntil: u.trialUntil?.toISOString() ?? null,
    status: statusOf(u, now),
    bonusReferrals: u.bonusReferrals,
  };
}

/** The filter as a query: each status is a range of the dates. */
function whereFor(filter: AdminProQuery["filter"], now: Date): Prisma.UserWhereInput {
  const discountFrom = new Date(now.getTime() - PROMO.discountDays * DAY);
  const paid: Prisma.UserWhereInput = { proSince: { not: null }, OR: [{ proUntil: null }, { proUntil: { gt: now } }] };
  const notPaid: Prisma.UserWhereInput = { OR: [{ proSince: null }, { proUntil: { lte: now } }] };
  switch (filter) {
    case "pro":
      return paid;
    case "trial":
      return { AND: [notPaid, { trialUntil: { gt: now } }] };
    case "discount":
      return { AND: [notPaid, { trialUntil: { lte: now, gt: discountFrom } }] };
    case "used":
      return { AND: [notPaid, { trialUntil: { lte: discountFrom } }] };
    case "free":
      return { AND: [notPaid, { trialUntil: null }] };
    case "active":
      return { OR: [paid, { trialUntil: { gt: now } }] };
    default:
      return {};
  }
}

/** PRO accounts for the admin: who, since when, the free month's end, and the counts. */
export async function listPro(
  prisma: PrismaClient,
  query: AdminProQuery,
): Promise<Paginated<AdminProRow> & { stats: AdminProStats }> {
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    AND: [
      whereFor(query.filter, now),
      query.query
        ? {
            OR: [
              { email: { contains: query.query, mode: "insensitive" } },
              { displayName: { contains: query.query, mode: "insensitive" } },
              { username: { contains: query.query, mode: "insensitive" } },
              { id: query.query },
            ],
          }
        : {},
    ],
  };
  const skip = (query.page - 1) * query.perPage;
  const [rows, total, pro, trial, discount] = await Promise.all([
    prisma.user.findMany({
      where,
      // PRO first (ending soonest first, for good after), then the free months ending soonest.
      orderBy: [
        { proSince: { sort: "desc", nulls: "last" } },
        { proUntil: { sort: "asc", nulls: "last" } },
        { trialUntil: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip,
      take: query.perPage,
      select: ROW_SELECT,
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: whereFor("pro", now) }),
    prisma.user.count({ where: whereFor("trial", now) }),
    prisma.user.count({ where: whereFor("discount", now) }),
  ]);
  return {
    ...paginated(rows.map((r) => toRow(r, now)), {
      page: query.page,
      perPage: query.perPage,
      total,
      hasNextPage: skip + rows.length < total,
    }),
    stats: { pro, trial, discount },
  };
}

/** One change to one account's PRO, as the admin asked. */
export async function setPro(prisma: PrismaClient, userId: string, input: AdminProAction): Promise<AdminProRow> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: ROW_SELECT });
  if (!user) throw new NotFoundError("User not found.");
  const now = new Date();
  let data: Prisma.UserUpdateInput;
  switch (input.action) {
    case "grant":
      data = { proSince: user.proSince ?? now, proUntil: null };
      break;
    case "grantDays":
      await addProDays(prisma, userId, input.days);
      data = {};
      break;
    case "revoke":
      data = {
        proSince: null,
        ...(user.proUntil && user.proUntil > now ? { proUntil: now } : {}),
        ...(user.trialUntil && user.trialUntil > now ? { trialUntil: now } : {}),
      };
      break;
    case "trial": {
      const from = user.trialUntil && user.trialUntil > now ? user.trialUntil : now;
      data = { trialUntil: new Date(from.getTime() + input.days * DAY) };
      break;
    }
    case "endTrial":
      data = user.trialUntil && user.trialUntil > now ? { trialUntil: now } : {};
      break;
    case "resetPromo":
      data = { trialUntil: null };
      break;
    case "bonusReferrals":
      data = { bonusReferrals: Math.max(0, user.bonusReferrals + input.count) };
      break;
  }
  const updated = await prisma.user.update({ where: { id: userId }, data, select: ROW_SELECT });
  return toRow(updated, now);
}
