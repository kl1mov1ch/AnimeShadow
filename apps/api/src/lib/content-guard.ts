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

/** Resolves whether the current request may see R+ content — false for a
 * signed-out visitor, otherwise based on their saved birth date. */
export async function resolveAllowAdult(
  prisma: PrismaClient,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
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
 * (Shikimori/Jikan/AniList results, blended trending rows, recommendation
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
