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
  /** The owner hides their followers and friends from this viewer. */
  hidden: z.boolean().default(false),
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
  /** The owner closed their wall to this viewer. */
  hidden: z.boolean().default(false),
});
export type WallPage = z.infer<typeof wallPageSchema>;

export const createWallPostInputSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
export type CreateWallPostInput = z.infer<typeof createWallPostInputSchema>;

/** One event from someone the viewer follows. */
export const friendEventSchema = feedEventSchema.extend({ user: userCardSchema });
export type FriendEvent = z.infer<typeof friendEventSchema>;

// ---------------------------------------------------------------------------
// Notifications: new episodes of titles in one's list.
// ---------------------------------------------------------------------------

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.literal("episode"),
  anime: z.object({
    id: z.number().int(),
    slug: z.string(),
    title: z.string(),
    titleLocalized: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
  episode: z.number().int(),
  /** The first new episode, when several came out at once. */
  fromEpisode: z.number().int().nullable(),
  createdAt: z.string(),
  read: z.boolean(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

/** Where new episodes are told besides the bell: the Telegram bot and browser push. */
export interface NotifySettings {
  telegram: {
    /** The server has a bot. */
    available: boolean;
    /** Its @username, for the link. */
    bot: string | null;
    /** The bot can write to this account (signed in by Telegram, or linked). */
    connected: boolean;
    /** It tried and was blocked: press Start in the bot again. */
    blocked: boolean;
    enabled: boolean;
    /** Server diagnostics; sign-in and message delivery are separate. */
    issue?: "token-rejected" | "unreachable" | "not-configured" | "receiver-disabled" | null;
  };
  push: {
    available: boolean;
    /** VAPID public key for PushManager.subscribe. */
    publicKey: string | null;
    enabled: boolean;
    /** Browsers subscribed. */
    devices: number;
  };
}

export const notifySettingsInputSchema = z.object({
  telegram: z.boolean().optional(),
  push: z.boolean().optional(),
});

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  /** The browser's id, so a guest's subscription becomes the account's on sign-in. */
  visitorId: z.string().min(8).max(100).optional(),
});

export const guestPushInputSchema = pushSubscriptionInputSchema.extend({ visitorId: z.string().min(8).max(100) });

export const pushUnsubscribeInputSchema = z.object({ endpoint: z.string().url().max(1000) });

export const notificationsReadInputSchema = z.object({
  /** These; or every one of this title; or, with neither, all. */
  ids: z.array(z.string()).max(200).optional(),
  animeId: z.number().int().positive().optional(),
});
