import type { Prisma, PrismaClient } from "@animeshadow/db";

/**
 * Content-rating gate. Two tiers, deliberately not configurable per user
 * beyond age:
 *  - Hentai ("Rx") is excluded for every request, verified or not — there is
 *    no setting that shows it.
 *  - Real adult content ("R+" — MAL's "mild nudity" tier, the least explicit
 *    rating above general audiences) is excluded unless the viewer has
 *    confirmed their age in their profile (see profile.service.ts).
 * Both providers' mappers can produce either a short form ("Rx", "R+") or
 * MAL's full string ("Rx - Hentai", "R+ - Mild Nudity") — matching by prefix
 * covers both without caring which provider a title came from.
 */

export function isHentaiRating(rating: string | null | undefined): boolean {
  return (rating ?? "").trim().toLowerCase().startsWith("rx");
}

export function isAdultRating(rating: string | null | undefined): boolean {
  return (rating ?? "").trim().toLowerCase().startsWith("r+");
}

export function computeIsAdult(birthDate: Date | null | undefined): boolean {
  if (!birthDate) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age >= 18;
}

/**
 * A guest's own birth date, typed on the page and sent as the
 * `x-adult-dob` header (YYYY-MM-DD) — self-reported, exactly as an
 * account's is. Null when absent or malformed.
 */
export function guestBirthDate(header: string | string[] | undefined): Date | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d > new Date() ? null : d;
}

/**
 * Whether the current request may see R+ content. For now: everyone — the
 * age check is switched off across the site, R+ titles carry an "18+" mark
 * instead. Hentai stays out regardless (isHentaiRating / contentGuardWhere).
 * The birth date an account may have saved is kept for later settings; to
 * bring the check back, set AGE_CHECK below to true.
 */
const AGE_CHECK = false;

export async function resolveAllowAdult(
  prisma: PrismaClient,
  userId: string | undefined,
  guestDob?: string | string[] | undefined,
): Promise<boolean> {
  if (!AGE_CHECK) return true;
  if (!userId) return computeIsAdult(guestBirthDate(guestDob));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthDate: true },
  });
  return computeIsAdult(user?.birthDate ?? null);
}

/** Merge into any `Prisma.AnimeWhereInput` (`{ AND: [yourWhere, contentGuardWhere(allowAdult)] }`)
 * to keep hentai out of every listing unconditionally, and R+ out of it for
 * anyone who hasn't verified their age. */
export function contentGuardWhere(allowAdult: boolean): Prisma.AnimeWhereInput {
  const blockedPrefixes = allowAdult ? ["rx"] : ["rx", "r+"];
  return {
    AND: blockedPrefixes.map((prefix) => ({
      NOT: { rating: { startsWith: prefix, mode: "insensitive" as const } },
    })),
  };
}

export function withContentGuard(
  where: Prisma.AnimeWhereInput,
  allowAdult: boolean,
): Prisma.AnimeWhereInput {
  return { AND: [where, contentGuardWhere(allowAdult)] };
}

/**
 * Defense-in-depth for anything assembled outside a single Prisma `where`
 * (Shikimori/AniList results, blended trending rows, recommendation
 * pools) — drops by `rating` right before a list of summaries leaves the
 * service layer. A title that hasn't been detail-synced yet has `rating:
 * null` and won't be caught here; `censored: true` on every Shikimori list
 * call (see the shikimori package) is the actual root-cause guard for that
 * gap, this is the backstop.
 */
export function filterAdultSummaries<T extends { rating: string | null }>(
  items: T[],
  allowAdult: boolean,
): T[] {
  return items.filter((item) => {
    if (isHentaiRating(item.rating)) return false;
    if (!allowAdult && isAdultRating(item.rating)) return false;
    return true;
  });
}
