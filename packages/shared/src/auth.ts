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
  /// First-touch `document.referrer`, captured client-side (lib/visitor.ts)
  /// — feeds the admin "where users came from" report. Never required.
  referrer: z.string().trim().max(500).optional(),
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

export const roleSchema = z.enum(["USER", "ADMIN"]);
export type Role = z.infer<typeof roleSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().default(null),
  createdAt: z.string(),
  role: roleSchema.default("USER"),
  /// Every account created through normal signup already confirmed a code
  /// before it existed at all (see confirmRegistrationInputSchema below), so
  /// this is `true` from the very first moment it's visible to the client.
  /// Kept as a field (rather than removed) for accounts created before that
  /// was true, and for Telegram sign-in, which has no inbox to confirm.
  emailVerified: z.boolean().default(false),
  /// True for an account created/linked via "Sign in with Telegram" — it has
  /// no real password behind it (see AuthService.loginWithTelegram), so the
  /// frontend skips asking for one anywhere a password would normally be
  /// required to confirm identity (e.g. deleting the account).
  isTelegramLinked: z.boolean().default(false),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ---------------------------------------------------------------------------
// Email verification (at signup) and password reset — both a 6-digit code
// emailed to the account, entered back within a short window.
// ---------------------------------------------------------------------------

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const verifyEmailInputSchema = z.object({
  code: verificationCodeSchema,
});
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;

export const forgotPasswordInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

export const resetPasswordInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  code: verificationCodeSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// ---------------------------------------------------------------------------
// Signup confirmation — the code sent by `registerInputSchema`'s endpoint.
// No account exists yet at this point (see AuthService.requestRegistration),
// so these carry the email explicitly rather than relying on a bearer token.
// ---------------------------------------------------------------------------

export const confirmRegistrationInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  code: verificationCodeSchema,
});
export type ConfirmRegistrationInput = z.infer<typeof confirmRegistrationInputSchema>;

export const resendRegistrationInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});
export type ResendRegistrationInput = z.infer<typeof resendRegistrationInputSchema>;

export const deleteAccountInputSchema = z.object({
  /// Empty for a Telegram-only account, which has no real password behind
  /// it (see AuthService.deleteAccount) — the field still has to be present
  /// in the request shape, just permitted to be blank in that one case.
  password: z.string(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;
