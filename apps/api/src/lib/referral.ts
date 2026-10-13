import { randomInt } from "node:crypto";
import type { PrismaClient } from "@animeshadow/db";
import {
  REFERRAL,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_REWARDS,
  type ReferralState,
} from "@animeshadow/shared";
import { BadRequestError } from "./errors.js";
import { addProDays, proActive } from "./pro.js";

/** A fresh invite code: 8 characters from an alphabet without look-alikes. */
export function newReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  return code;
}

/** The account's code — made now if it somehow has none (retried on a clash). */
export async function ensureReferralCode(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newReferralCode();
    const done = await prisma.user
      .update({ where: { id: userId }, data: { referralCode: code } })
      .then(() => true)
      .catch(() => false);
    if (done) return code;
  }
  throw new Error("Could not make an invite code");
}

/** Whose code this is — null for a code nobody has (or a malformed one). */
export async function referrerFor(prisma: PrismaClient, code: string | null | undefined): Promise<string | null> {
  const clean = code?.trim().toUpperCase();
  if (!clean || !/^[A-Z0-9]{4,12}$/.test(clean)) return null;
  const owner = await prisma.user.findUnique({ where: { referralCode: clean }, select: { id: true, isBanned: true } });
  return owner && !owner.isBanned ? owner.id : null;
}

/**
 * Where an account stands with its invites: its code, the friends who came
 * (with their hours), both ladders with what is taken and what can be, and
 * its PRO right now.
 */
export async function referralState(prisma: PrismaClient, userId: string): Promise<ReferralState> {
  const code = await ensureReferralCode(prisma, userId);
  const [me, friends, taken] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { proSince: true, proUntil: true, trialUntil: true, titleUnlocked: true },
    }),
    prisma.user.findMany({
      where: { referredById: userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, displayName: true, username: true, avatarUrl: true, createdAt: true },
    }),
    prisma.referralReward.findMany({ where: { userId }, select: { rewardId: true } }),
  ]);
  const watched = friends.length
    ? await prisma.watchSession.groupBy({
        by: ["userId"],
        where: { userId: { in: friends.map((f) => f.id) } },
        _sum: { seconds: true },
      })
    : [];
  const seconds = new Map(watched.map((w) => [w.userId, w._sum.seconds ?? 0]));
  const people = friends.map((f) => {
    const s = seconds.get(f.id) ?? 0;
    return {
      id: f.id,
      displayName: f.displayName,
      username: f.username,
      avatarUrl: f.avatarUrl,
      joinedAt: f.createdAt.toISOString(),
      hours: Math.round((s / 3600) * 10) / 10,
      counted: s >= REFERRAL.countAfterSeconds,
    };
  });
  const counted = people.filter((p) => p.counted).length;
  const hours = Math.round(([...seconds.values()].reduce((a, b) => a + b, 0) / 3600) * 10) / 10;
  const claimed = new Set(taken.map((t) => t.rewardId));
  const now = new Date();
  const paid = me.proSince != null && (me.proUntil == null || me.proUntil > now);

  return {
    code,
    friends: { total: people.length, counted },
    hours,
    people,
    rewards: REFERRAL_REWARDS.map((r) => {
      const reached = (r.track === "friends" ? counted : hours) >= r.at;
      return {
        id: r.id,
        track: r.track,
        at: r.at,
        proDays: r.proDays ?? null,
        badge: r.badge ?? null,
        title: r.title ?? false,
        label: r.label,
        claimed: claimed.has(r.id),
        claimable: reached && !claimed.has(r.id),
      };
    }),
    pro: {
      active: proActive(me, now),
      until: paid ? (me.proUntil?.toISOString() ?? null) : null,
      trialUntil: me.trialUntil && me.trialUntil > now ? me.trialUntil.toISOString() : null,
    },
    titleUnlocked: me.titleUnlocked,
  };
}

/**
 * Takes one reached step of a ladder: the row first (its key makes a second
 * take of the same step fail), then what it gives — PRO days, a badge, the
 * nick tag.
 */
export async function claimReferralReward(prisma: PrismaClient, userId: string, rewardId: string): Promise<ReferralState> {
  const def = REFERRAL_REWARDS.find((r) => r.id === rewardId);
  if (!def) throw new BadRequestError("Такой награды нет.");
  const state = await referralState(prisma, userId);
  const reward = state.rewards.find((r) => r.id === rewardId)!;
  if (reward.claimed) throw new BadRequestError("Эта награда уже получена.");
  if (!reward.claimable) throw new BadRequestError("До этой награды ещё нужно дорасти.");

  const created = await prisma.referralReward
    .create({ data: { userId, rewardId } })
    .then(() => true)
    .catch(() => false);
  if (!created) throw new BadRequestError("Эта награда уже получена.");

  if (def.proDays) await addProDays(prisma, userId, def.proDays);
  if (def.badge) {
    await prisma.userAchievement
      .upsert({
        where: { userId_achievementId: { userId, achievementId: def.badge } },
        create: { userId, achievementId: def.badge },
        update: {},
      })
      .catch(() => undefined);
  }
  if (def.title) await prisma.user.update({ where: { id: userId }, data: { titleUnlocked: true } });
  return referralState(prisma, userId);
}
