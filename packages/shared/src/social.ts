import { z } from "zod";
import { avatarFrameSchema, feedEventSchema, profileTitleSchema, titleIconSchema } from "./profile.js";

/** Someone, as a list of people shows them. */
export const userCardSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isPro: z.boolean(),
  onlineStatus: z.enum(["ONLINE", "OFFLINE", "DND"]),
  /** Episodes watched — a quick measure of how active they are. */
  episodes: z.number().int(),
  /** What they wear on their profile, so they look like themselves everywhere. */
  avatarFrame: avatarFrameSchema.nullable().default(null),
  profileTitle: profileTitleSchema.nullable().default(null),
  /** The PRO custom title; null without PRO. */
  titlePrefix: z.string().nullable().default(null),
  titleIcon: titleIconSchema.nullable().default(null),
  /** The viewer follows them / they follow the viewer. */
  following: z.boolean(),
  followsYou: z.boolean(),
});
export type UserCard = z.infer<typeof userCardSchema>;

/** Followers, following and friends of one account, and how the viewer relates to it. */
export const socialSummarySchema = z.object({
  followers: z.number().int(),
  following: z.number().int(),
  friends: z.number().int(),
  /** The viewer follows this account. */
  isFollowing: z.boolean(),
  /** This account follows the viewer. */
  followsYou: z.boolean(),
  /** A few friends' faces, for the profile's header. */
  friendFaces: z.array(userCardSchema),
});
export type SocialSummary = z.infer<typeof socialSummarySchema>;

export const followKindSchema = z.enum(["followers", "following", "friends"]);
export type FollowKind = z.infer<typeof followKindSchema>;

export const wallPostSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  author: userCardSchema,
  /** The viewer may delete it (its author, the wall's owner, an admin). */
  canDelete: z.boolean(),
});
export type WallPost = z.infer<typeof wallPostSchema>;

export const wallPageSchema = z.object({
  items: z.array(wallPostSchema),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type WallPage = z.infer<typeof wallPageSchema>;

export const createWallPostInputSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
export type CreateWallPostInput = z.infer<typeof createWallPostInputSchema>;

/** One event from someone the viewer follows. */
export const friendEventSchema = feedEventSchema.extend({ user: userCardSchema });
export type FriendEvent = z.infer<typeof friendEventSchema>;
