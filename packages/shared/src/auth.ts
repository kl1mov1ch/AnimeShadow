import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "That password is too long");

export const registerInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Pick a name with at least 2 characters")
    .max(40, "Keep your name under 40 characters"),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** The payload the Telegram Login Widget hands back — verified server-side
 * via `hash` (HMAC-SHA256 of the rest, keyed by the bot token) before it's
 * trusted for anything. */
export const telegramAuthInputSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.number().int().positive(),
  hash: z.string(),
});
export type TelegramAuthInput = z.infer<typeof telegramAuthInputSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
