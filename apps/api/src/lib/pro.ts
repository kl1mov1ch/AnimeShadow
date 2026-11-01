import { PROMO } from "@animeshadow/shared";
import type { Prisma, PrismaClient } from "@animeshadow/db";
import type { FastifyBaseLogger } from "fastify";

/**
 * PRO comes three ways: for good (`proSince` with no `proUntil`), for a
 * while (`proSince` until `proUntil` — paid, granted by an admin, earned
 * with referrals), or the free first month every new account gets
 * (`trialUntil`). Every "is this account PRO" check goes through here, so
 * all three count everywhere PRO does — and stop counting the moment they
 * run out, without waiting for anything to clear them.
 */
export function proActive(
  user: { proSince: Date | null; proUntil?: Date | null; trialUntil?: Date | null },
  now = new Date(),
): boolean {
  const paid = user.proSince != null && (user.proUntil == null || user.proUntil > now);
  const trial = user.trialUntil != null && user.trialUntil > now;
  return paid || trial;
}

/** The free PRO a new account gets, and the half-price window after it (see PROMO). */
export const TRIAL_DAYS = PROMO.trialDays;
export const DISCOUNT_DAYS = PROMO.discountDays;
export const DISCOUNT_PERCENT = PROMO.discountPercent;

const DAY = 86_400_000;

export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY);
}

/**
 * Adds days of PRO to an account: from the end of the PRO it has now (so
 * months stack), or from today. PRO for good stays for good.
 */
export async function addProDays(
  prisma: PrismaClient | Prisma.TransactionClient, userId: string, days: number, now = new Date(),
): Promise<{ proUntil: Date | null }> {
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new Error("Invalid PRO days");
  // A single UPDATE locks the user row. Simultaneous grants add rather than overwrite;
  // both paid PRO and the remaining trial count, permanent PRO stays permanent.
  const [updated] = await prisma.$queryRaw<{ proUntil: Date | null }[]>`
    UPDATE "User" SET
      "proUntil" = CASE WHEN "proSince" IS NOT NULL AND "proUntil" IS NULL THEN NULL
        ELSE GREATEST(${now}::timestamp, "proUntil", "trialUntil") + ${days} * INTERVAL '1 day' END,
      "proSince" = COALESCE("proSince", ${now}::timestamp)
    WHERE id = ${userId} RETURNING "proUntil"
  `;
  if (!updated) throw new Error("PRO account not found");
  return updated;
}

/**
 * Clears PRO that has run out, so what reads `proSince` alone (the donor
 * filter, the admin's counts) agrees with `proActive`. Runs at start and
 * every ten minutes; `proUntil` is kept, as a record of when it ended.
 */
export function startProExpiry(prisma: PrismaClient, log: FastifyBaseLogger): () => void {
  const run = async () => {
    const { count } = await prisma.user
      .updateMany({ where: { proSince: { not: null }, proUntil: { lte: new Date() } }, data: { proSince: null } })
      .catch(() => ({ count: 0 }));
    if (count > 0) log.info({ count }, "expired PRO cleared");
  };
  void run();
  const timer = setInterval(() => void run(), 10 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
