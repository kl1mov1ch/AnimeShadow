import type { PrismaClient } from "@animeshadow/db";
import { DEFAULT_PROFILE_PRIVACY, type ProfilePrivacy, profilePrivacySchema, type Visibility } from "@animeshadow/shared";

/** A stored privacy setting, made whole (parts added since get their default). */
export function readPrivacy(raw: unknown): ProfilePrivacy {
  const parsed = profilePrivacySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PROFILE_PRIVACY;
}

/** Whether one level lets this viewer in. "users" = any signed-in account. */
export function allowed(visibility: Visibility, viewerId: string | null, friend = false): boolean {
  if (visibility === "public") return true;
  if (visibility === "users") return viewerId != null;
  if (visibility === "friends") return friend;
  return false;
}

export async function areFriends(prisma: PrismaClient, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const n = await prisma.follow.count({
    where: { OR: [{ followerId: a, followingId: b }, { followerId: b, followingId: a }] },
  });
  return n === 2;
}

/**
 * Which parts of a profile this viewer may see. The owner sees everything;
 * the whole-profile setting closes every part with it. Friendship is only
 * looked up when some part is for friends.
 */
export function visibleParts(
  privacy: ProfilePrivacy,
  viewerId: string | null,
  own: boolean,
  friend: boolean,
): Record<keyof ProfilePrivacy, boolean> {
  const whole = own || allowed(privacy.profile, viewerId, friend);
  const part = (k: keyof ProfilePrivacy) => own || (whole && allowed(privacy[k], viewerId, friend));
  return {
    profile: whole,
    list: part("list"),
    stats: part("stats"),
    activity: part("activity"),
    watching: part("watching"),
    favorites: part("favorites"),
    achievements: part("achievements"),
    social: part("social"),
    wall: part("wall"),
    views: part("views"),
  };
}

/** One part, straight from the database: may this viewer see it? */
export async function canSeePart(
  prisma: PrismaClient,
  ownerId: string,
  viewerId: string | null,
  part: keyof ProfilePrivacy,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { profilePrivacy: true } });
  if (!owner) return false;
  const privacy = readPrivacy(owner.profilePrivacy);
  const needsFriend = privacy[part] === "friends" || privacy.profile === "friends";
  const friend = needsFriend && viewerId ? await areFriends(prisma, ownerId, viewerId) : false;
  return visibleParts(privacy, viewerId, false, friend)[part];
}
