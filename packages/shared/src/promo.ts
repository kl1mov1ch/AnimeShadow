import { z } from "zod";

/**
 * The welcome offer: 15 days of PRO free, then 15 days to take PRO at half
 * price, then the full price.
 * New accounts get the free month at sign-up; accounts made before the offer
 * can take it once. For guests it is shown as an offer ending this week, with a timer —
 * the rounds run back to back, so a new visitor always has one ahead.
 */
export const PROMO = {
  trialDays: 15,
  discountDays: 15,
  discountPercent: 50,
  /** PRO's monthly price (the "Ронин" tier on the support page), in dollars. */
  proMonthlyUsd: 2.99,
} as const;

/**
 * PRO, one subscription in three lengths — the longer, the cheaper a month.
 * Prices in dollars; `save` is against paying month by month.
 */
export const PRO_PLANS = [
  { months: 1, usd: 2.99 },
  { months: 3, usd: 7.49 },
  { months: 12, usd: 23.99 },
] as const;
export type ProPlan = (typeof PRO_PLANS)[number];

/** A plan's price per month, and how much it saves against monthly (whole percent). */
export function proPlanMath(plan: ProPlan): { perMonth: number; save: number } {
  const perMonth = Math.round((plan.usd / plan.months) * 100) / 100;
  const full = PROMO.proMonthlyUsd * plan.months;
  return { perMonth, save: Math.round((1 - plan.usd / full) * 100) };
}

/** When the first round started; every round after follows on. */
const PROMO_EPOCH = Date.UTC(2026, 9, 1);
/** The guests' timer runs a week at a time — a near deadline, not a far one. */
const ROUND_MS = 7 * 86_400_000;

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
