import { Prisma } from "@animeshadow/db";

/**
 * Counting people, not browsers.
 *
 * A browser that has ever been signed in is tied to that account
 * (VisitorUser). A person is then the account behind a browser, or the
 * browser itself when nobody ever signed in on it — so one member on a
 * phone and a laptop is one person, and a guest who signs in halfway
 * through the day is a member, not a guest *and* a member. A guest is a
 * browser never tied to an account; coming back the same day (or the next
 * one) is a repeat visit, not another guest.
 *
 * Both fragments read the current "PageView" row unaliased.
 */
export const PERSON = Prisma.sql`COALESCE(
  (SELECT vu."userId" FROM "VisitorUser" vu WHERE vu."visitorId" = "PageView"."visitorId"),
  "PageView"."visitorId"
)`;

/** The row's browser belongs to a member. */
export const IS_MEMBER = Prisma.sql`EXISTS (SELECT 1 FROM "VisitorUser" vu WHERE vu."visitorId" = "PageView"."visitorId")`;

export const NOT_BOT = Prisma.sql`("PageView".device IS NULL OR "PageView".device <> 'bot')`;

const MSK_OFFSET = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** The start of today in Moscow (no daylight saving there) — the admin's day everywhere. */
export function moscowDayStart(now = new Date()): Date {
  return new Date(Math.floor((now.getTime() + MSK_OFFSET) / DAY_MS) * DAY_MS - MSK_OFFSET);
}
