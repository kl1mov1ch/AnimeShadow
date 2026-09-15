import { createHash, randomInt } from "node:crypto";

/** How long a code stays valid after being issued. */
export const VERIFICATION_CODE_TTL_MINUTES = 15;
/** Wrong guesses allowed before a code is dead and must be re-requested —
 * well short of making a 10^6 brute force remotely practical. */
export const MAX_VERIFICATION_ATTEMPTS = 5;
/** Floor between two codes being issued for the same (user, purpose) — stops
 * "resend" from being usable as an email-bombing lever. */
export const RESEND_COOLDOWN_SECONDS = 45;

/** A 6-digit code, e.g. "042917" — always zero-padded, never generated with
 * `Math.random()` (not cryptographically safe). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Codes are stored hashed (SHA-256 is fine here — this isn't a password,
 * it's a 6-digit, 15-minute-lived, attempt-limited one-time code; the cost
 * of bcrypt buys nothing extra against a value with 10^6 possibilities and
 * a hard attempt cap that already makes offline brute force irrelevant). */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
