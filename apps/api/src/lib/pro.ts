import { PROMO } from "@animeshadow/shared";
import type { PrismaClient } from "@animeshadow/db";
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
export async function addProDays(prisma: PrismaClient, userId: string, days: number): Promise<{ proUntil: Date | null }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { proSince: true, proUntil: true } });
  const now = new Date();
  if (user.proSince && !user.proUntil) return { proUntil: null };
  const from = user.proSince && user.proUntil && user.proUntil > now ? user.proUntil : now;
  const proUntil = new Date(from.getTime() + days * DAY);
  await prisma.user.update({
    where: { id: userId },
    data: { proSince: user.proSince && user.proUntil && user.proUntil > now ? user.proSince : now, proUntil },
  });
  return { proUntil };
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
