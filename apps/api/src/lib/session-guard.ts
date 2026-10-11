import type { PrismaClient } from "@animeshadow/db";

/** How long one answer about an account is trusted. */
const TTL_MS = 60_000;
const MAX_ENTRIES = 50_000;

interface Entry {
  version: number;
  banned: boolean;
  missing: boolean;
  at: number;
}

const cache = new Map<string, Entry>();

/**
 * Is a token still good for its account? A signature alone said yes for
 * seven days, through a ban and through a password reset — the thief of a
 * token kept it after the owner changed the password. Every token carries
 * the account's `tokenVersion`; a reset, an admin-set password or a ban
 * raises it (revokeSessions), and from then on the old tokens are refused.
 *
 * One primary-key read per account per minute, kept in memory; revoking
 * drops the account's entry at once, so it takes effect on the next request.
 */
export async function sessionIsValid(prisma: PrismaClient, userId: string, version: number): Promise<boolean> {
  const now = Date.now();
  let entry = cache.get(userId);
  if (!entry || now - entry.at > TTL_MS) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true, isBanned: true },
    });
    if (cache.size >= MAX_ENTRIES) cache.clear();
    entry = { version: user?.tokenVersion ?? 0, banned: user?.isBanned ?? false, missing: !user, at: now };
    cache.set(userId, entry);
  }
  return !entry.missing && !entry.banned && version === entry.version;
}

/** Ends every session of an account: its tokens stop working at once. */
export async function revokeSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } }, select: { id: true } });
  cache.delete(userId);
}

/** Forgets what is cached for an account (after a ban is lifted, say). */
export function forgetSession(userId: string): void {
  cache.delete(userId);
}
