import { z } from "zod";

/**
 * Invite friends, earn PRO. Every account has its own code; a friend uses it
 * at sign-up (typed in, or carried by /register?ref=CODE). Two ladders:
 * how many friends came (a friend counts once they have watched an hour —
 * so a pile of empty accounts earns nothing), and how many hours all of
 * them have watched together. Each step is taken with a button; PRO from
 * them stacks onto PRO running now and runs out on its own.
 */
export const REFERRAL = {
  /** A friend counts for the friends ladder after this much watching. */
  countAfterSeconds: 3600,
} as const;

export type ReferralTrack = "friends" | "hours";

export interface ReferralRewardDef {
  id: string;
  track: ReferralTrack;
  /** Friends (counted) or hours (all friends together) needed. */
  at: number;
  /** Days of PRO it gives. */
  proDays?: number;
  /** The achievement (badge) it gives. */
  badge?: string;
  /** Unlocks the custom nick tag for good, PRO or not. */
  title?: boolean;
  /** What it gives, in a few words. */
  label: string;
}

export const REFERRAL_REWARDS: readonly ReferralRewardDef[] = [
  { id: "f1", track: "friends", at: 1, badge: "referral-guide", label: "Значок «Проводник»" },
  { id: "f3", track: "friends", at: 3, proDays: 7, label: "7 дней PRO" },
  { id: "f5", track: "friends", at: 5, proDays: 30, label: "Месяц PRO" },
  { id: "f10", track: "friends", at: 10, proDays: 60, badge: "referral-ambassador", label: "2 месяца PRO и значок «Посол»" },
  { id: "f25", track: "friends", at: 25, proDays: 180, badge: "referral-legend", label: "Полгода PRO и значок «Легенда»" },
  { id: "h20", track: "hours", at: 20, proDays: 30, badge: "referral-spark", label: "Месяц PRO и значок «Искра»" },
  { id: "h70", track: "hours", at: 70, proDays: 30, label: "Ещё месяц PRO" },
  { id: "h100", track: "hours", at: 100, title: true, label: "Своя приписка к нику — навсегда" },
  { id: "h250", track: "hours", at: 250, proDays: 90, label: "3 месяца PRO" },
  { id: "h500", track: "hours", at: 500, proDays: 365, badge: "referral-star", label: "Год PRO и значок «Звезда»" },
] as const;

/** Codes are 8 characters from an alphabet without look-alikes. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,12}$/, "Код — 8 латинских букв и цифр");

export const referralFriendSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.string(),
  hours: z.number(),
  /** Has watched enough to count for the friends ladder. */
  counted: z.boolean(),
});
export type ReferralFriend = z.infer<typeof referralFriendSchema>;

export const referralRewardStateSchema = z.object({
  id: z.string(),
  track: z.enum(["friends", "hours"]),
  at: z.number(),
  proDays: z.number().nullable(),
  badge: z.string().nullable(),
  title: z.boolean(),
  label: z.string(),
  claimed: z.boolean(),
  /** Reached and not taken yet. */
  claimable: z.boolean(),
});
export type ReferralRewardState = z.infer<typeof referralRewardStateSchema>;

export const referralStateSchema = z.object({
  code: z.string(),
  /** total/counted include `bonus` — friends an admin added. */
  friends: z.object({ total: z.number(), counted: z.number(), bonus: z.number().default(0) }),
  /** All friends' watching together, in hours (one decimal). */
  hours: z.number(),
  rewards: z.array(referralRewardStateSchema),
  people: z.array(referralFriendSchema),
  /** The account's PRO now: until when (null = for good), or not PRO. */
  pro: z.object({ active: z.boolean(), until: z.string().nullable(), trialUntil: z.string().nullable() }),
  titleUnlocked: z.boolean(),
});
export type ReferralState = z.infer<typeof referralStateSchema>;

export const referralClaimInputSchema = z.object({ rewardId: z.string().min(1).max(10) });
