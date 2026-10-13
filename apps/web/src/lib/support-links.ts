/**
 * Where "support the project" actually goes. Boosty handles the real money
 * flow (one-time tips and recurring tiers) — the site never touches payment
 * details itself, just links out.
 *
 * TODO: replace with the real Boosty page before this goes live. Until then
 * every donate/subscribe button on /support points at this placeholder.
 */
export const BOOSTY_URL = "https://boosty.to/animeshadow";

/**
 * The tip jar — "buy us a coffee": one-off donations on a donation service.
 * TODO: put the service's link here (DonationAlerts, Boosty donate,
 * CloudTips…). If it takes the amount in the link, write {amount} where it
 * goes (e.g. "https://example.com/tip?sum={amount}") and the coffee slider
 * fills it in. While this is empty, every coffee button leads to Boosty.
 */
export const DONATE_URL: string = "";

/** Where a coffee button goes — with the amount, when the service takes one. */
export function donateHref(amount?: number): string {
  if (!DONATE_URL) return BOOSTY_URL;
  return DONATE_URL.replace("{amount}", amount != null ? String(amount) : "");
}
