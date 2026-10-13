import { z } from "zod";

/**
 * The welcome offer: the first month of PRO free, the second at half price.
 * New accounts get the free month at sign-up; accounts made before the offer
 * can take it once. For guests it is shown as a 30-day offer with a timer —
 * the rounds run back to back, so a new visitor always has one ahead.
 */
export const PROMO = {
  trialDays: 30,
  discountDays: 30,
  discountPercent: 50,
  /** PRO's monthly price (the "Ронин" tier on the support page), in dollars. */
  proMonthlyUsd: 2.99,
} as const;

/** When the first 30-day round started; every round after follows on. */
const PROMO_EPOCH = Date.UTC(2026, 9, 1);
const ROUND_MS = PROMO.trialDays * 86_400_000;

/** The end of the current public round — what a guest's timer counts down to. */
export function promoRoundEnd(now = Date.now()): Date {
  const rounds = Math.floor((now - PROMO_EPOCH) / ROUND_MS) + 1;
  return new Date(PROMO_EPOCH + Math.max(1, rounds) * ROUND_MS);
}

/** The second month's price, after the discount. */
export function promoSecondMonthUsd(): number {
  return Math.round(PROMO.proMonthlyUsd * (100 - PROMO.discountPercent)) / 100;
}

/** "$1.50", "$2.99". */
export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export const promoPhaseSchema = z.enum([
  /** Never had the free month — can take it (once). */
  "claimable",
  /** In the free month. */
  "trial",
  /** Free month over; the half-price second month is on offer. */
  "discount",
  /** Offer used up. */
  "used",
  /** Already PRO for good — the offer isn't for them. */
  "pro",
]);
export type PromoPhase = z.infer<typeof promoPhaseSchema>;

export const promoStateSchema = z.object({
  phase: promoPhaseSchema,
  trialUntil: z.string().nullable(),
  discountUntil: z.string().nullable(),
  /** In the "pro" phase: when PRO runs out; null = for good. */
  proUntil: z.string().nullable().default(null),
});
export type PromoState = z.infer<typeof promoStateSchema>;

// ---------------------------------------------------------------------------
// Admin: PRO accounts
// ---------------------------------------------------------------------------

/** Where an account stands: PRO for good, in the free month, on the
 * half-price month, the offer used up, or free (never had it). */
export const proStatusSchema = z.enum(["pro", "trial", "discount", "used", "free"]);
export type ProStatus = z.infer<typeof proStatusSchema>;

export const adminProQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  filter: z.enum(["active", "pro", "trial", "discount", "used", "free", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminProQuery = z.infer<typeof adminProQuerySchema>;

export const adminProRowSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  proSince: z.string().nullable(),
  /** When PRO runs out; null with proSince = for good. */
  proUntil: z.string().nullable(),
  trialUntil: z.string().nullable(),
  status: proStatusSchema,
  /** Friends an admin added on the referral ladder. */
  bonusReferrals: z.number().default(0),
});
export type AdminProRow = z.infer<typeof adminProRowSchema>;

export const adminProStatsSchema = z.object({
  pro: z.number(),
  trial: z.number(),
  discount: z.number(),
});
export type AdminProStats = z.infer<typeof adminProStatsSchema>;

/** What an admin can do to one account's PRO. */
export const adminProActionSchema = z.discriminatedUnion("action", [
  /** PRO for good. */
  z.object({ action: z.literal("grant") }),
  /** PRO for a number of days (as after a month paid on Boosty); stacks onto PRO running now. */
  z.object({ action: z.literal("grantDays"), days: z.number().int().min(1).max(3650) }),
  /** No PRO at all: for-good PRO taken off and a running free month ended. */
  z.object({ action: z.literal("revoke") }),
  /** Add days to the free month (from its end if it is running, else from now). */
  z.object({ action: z.literal("trial"), days: z.number().int().min(1).max(365) }),
  /** End the free month now — the half-price month starts. */
  z.object({ action: z.literal("endTrial") }),
  /** Forget the offer was ever used: the account can take the free month again. */
  z.object({ action: z.literal("resetPromo") }),
  /** Add (or take back, negative) friends on the referral friends ladder. */
  z.object({ action: z.literal("bonusReferrals"), count: z.number().int().min(-1000).max(1000) }),
]);
export type AdminProAction = z.infer<typeof adminProActionSchema>;
