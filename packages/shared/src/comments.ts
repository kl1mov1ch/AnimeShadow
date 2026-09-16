import { z } from "zod";
import { titleIconSchema } from "./profile.js";

export const commentModeSchema = z.enum(["PUBLIC", "ANON", "SUPPORTER"]);
export type CommentMode = z.infer<typeof commentModeSchema>;

export const commentAuthorSchema = z.object({
  kind: z.enum(["user", "anon", "deleted"]),
  /** Only set for `kind: "user"` — enough to open their public profile even
   * when they've never claimed a username. Anon/deleted stay null on
   * purpose: an anonymous post has nothing to click through to. */
  id: z.string().nullable(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  rank: z.enum(["NOVICE", "ADVANCED", "EXPERT", "LEGEND"]).nullable(),
  isPro: z.boolean(),
  /** Up to MAX_SHOWCASE_ACHIEVEMENTS ids — the same pins shown on their profile. */
  showcaseAchievementIds: z.array(z.string()),
  titlePrefix: z.string().nullable(),
  titleIcon: titleIconSchema.nullable(),
});
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

// One level of nesting is enough for the UI; deeper replies flatten under the parent.
const baseComment = z.object({
  id: z.string(),
  animeId: z.number().int(),
  parentId: z.string().nullable(),
  body: z.string(),
  mode: commentModeSchema,
  author: commentAuthorSchema,
  likeCount: z.number().int(),
  dislikeCount: z.number().int(),
  myVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Comment = z.infer<typeof baseComment> & { replies: Comment[] };

export const commentSchema: z.ZodType<Comment> = baseComment.extend({
  replies: z.lazy(() => commentSchema.array()),
});

export const createCommentInputSchema = z.object({
  animeId: z.number().int().positive(),
  body: z.string().trim().min(1, "Enter a comment").max(4000, "Too long"),
  mode: commentModeSchema.default("PUBLIC"),
  parentId: z.string().nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

export const editCommentInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type EditCommentInput = z.infer<typeof editCommentInputSchema>;

export const voteCommentInputSchema = z.object({
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});
export type VoteCommentInput = z.infer<typeof voteCommentInputSchema>;

export const commentQuerySchema = z.object({
  sort: z.enum(["new", "old", "top"]).default("new"),
  onlyDonor: z.coerce.boolean().optional(),
  onlyAnon: z.coerce.boolean().optional(),
});
export type CommentQuery = z.infer<typeof commentQuerySchema>;
