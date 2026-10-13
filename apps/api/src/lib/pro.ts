/**
 * PRO is either for good (`proSince`: paid or donated) or for the free first
 * month every new account gets (`trialUntil`). Every "is this account PRO"
 * check goes through here, so the trial counts everywhere PRO does.
 */
export function proActive(user: { proSince: Date | null; trialUntil?: Date | null }, now = new Date()): boolean {
  return user.proSince != null || (user.trialUntil != null && user.trialUntil > now);
}

/** The free month: thirty days from now. */
export const TRIAL_DAYS = 30;
/** After the free month, the second one at half price — for this long. */
export const DISCOUNT_DAYS = 30;
export const DISCOUNT_PERCENT = 50;

export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}
