import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, type PrismaClient, type User } from "@animeshadow/db";
import type {
  LoginInput,
  PublicUser,
  RegisterInput,
  TelegramAuthInput,
} from "@animeshadow/shared";
import bcrypt from "bcryptjs";
import {
  BadRequestError,
  ConflictError,
  InvalidCodeError,
  UnauthorizedError,
} from "../lib/errors.js";
import { accountsDeletedTotal, loginsTotal, registrationsTotal } from "../lib/metrics.js";
import { fetchReactionGif, randomReactionCategory } from "../lib/reaction-gif.js";
import {
  generateCode,
  hashCode,
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_CODE_TTL_MINUTES,
} from "../lib/verification-code.js";
import type { EmailService } from "./email.service.js";

/** A generated character-style avatar — the fallback when nekos.best is
 * unreachable at signup, so a slow/down third party can never be the reason
 * an account fails to create. */
function fallbackAvatarUrl(): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${randomUUID()}&radius=50&backgroundType=gradientLinear`;
}

/**
 * Every new account gets a random reaction gif — the same nekos.best pool
 * the About page draws from — as its default avatar, picked once and never
 * re-rolled (the row just stores the URL nekos.best already hosts, so this
 * costs the server nothing ongoing: no image bytes, no cache, one string).
 * Falls back to a generated DiceBear avatar if nekos.best doesn't answer in
 * time, rather than holding up registration on a third party.
 */
async function defaultAvatarUrl(): Promise<string> {
  const url = await fetchReactionGif(randomReactionCategory(), 3000);
  return url ?? fallbackAvatarUrl();
}

/** How stale a Telegram login attempt can be before it's rejected — the
 * widget signs `auth_date` once, at the moment the user actually clicked
 * through on Telegram's side, so anything not fresh could be a replayed
 * payload rather than a live login. */
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;
const BCRYPT_ROUNDS = 12;

export interface AuthServiceDeps {
  prisma: PrismaClient;
  proForAll?: boolean;
  /** Where uploaded avatars live — same directory ProfileService writes to,
   * so a downloaded Telegram photo and a manually uploaded one are served
   * identically by the /uploads/avatars/:file route. */
  uploadsDir: string;
  /** Unset = "Sign in with Telegram" is simply refused with a clear error;
   * nothing else about auth depends on it. */
  telegramBotToken?: string | undefined;
  /** Lowercased emails that get promoted to ADMIN the next time they log in
   * or load /auth/me — see ensureAdminRole. Empty = no bootstrap admin. */
  adminEmails?: string[];
  email: EmailService;
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly proForAll: boolean;
  private readonly uploadsDir: string;
  private readonly telegramBotToken?: string | undefined;
  private readonly adminEmails: string[];
  private readonly email: EmailService;

  constructor(deps: AuthServiceDeps) {
    this.prisma = deps.prisma;
    this.proForAll = deps.proForAll ?? false;
    this.uploadsDir = deps.uploadsDir;
    this.telegramBotToken = deps.telegramBotToken;
    this.adminEmails = deps.adminEmails ?? [];
    this.email = deps.email;
  }

  /**
   * Step 1 of signup: no `User` row is created yet. The submitted details
   * (password already hashed — never held plain, not even in memory longer
   * than this call needs) are parked in `PendingRegistration` and a code is
   * emailed; the account itself is only created once that code comes back
   * (see `confirmRegistration`). This is deliberate: an email address isn't
   * proven reachable, let alone owned by the person typing it, until they
   * can produce a code that was sent to it — so nothing should exist, and
   * nobody should be signed in, before that happens.
   */
  async requestRegistration(input: RegisterInput): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError("An account with that email already exists.");
    }

    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email: input.email },
    });
    if (pending && this.issuedAt(pending).getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000) {
      return; // a very recent code already went out — absorbed silently
    }

    const [passwordHash, code] = await Promise.all([
      bcrypt.hash(input.password, BCRYPT_ROUNDS),
      Promise.resolve(generateCode()),
    ]);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000);

    await this.prisma.pendingRegistration.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        referrer: input.referrer || null,
        codeHash: hashCode(code),
        expiresAt,
      },
      update: {
        displayName: input.displayName,
        passwordHash,
        referrer: input.referrer || null,
        codeHash: hashCode(code),
        attempts: 0,
        expiresAt,
      },
    });

    await this.email.sendVerificationCode(input.email, input.displayName, code);
  }

  /**
   * Step 2: the code is right — *now* the account is actually created, from
   * exactly what was parked in step 1, and the caller is signed in for the
   * first time. Wrong/expired/attempts-exhausted all fail identically
   * (InvalidCodeError), same reasoning as `consumeCode` below.
   */
  async confirmRegistration(email: string, code: string): Promise<PublicUser> {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending || pending.expiresAt < new Date()) throw new InvalidCodeError();
    if (pending.attempts >= MAX_VERIFICATION_ATTEMPTS) throw new InvalidCodeError();

    if (pending.codeHash !== hashCode(code)) {
      await this.prisma.pendingRegistration.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      throw new InvalidCodeError();
    }

    const avatarUrl = await defaultAvatarUrl();
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: pending.email,
            displayName: pending.displayName,
            passwordHash: pending.passwordHash,
            avatarUrl,
            referrer: pending.referrer,
            // They just proved they own the inbox — that's exactly what
            // "verified" means; nothing left to confirm after this.
            emailVerifiedAt: new Date(),
            ...(this.proForAll ? { proSince: new Date() } : {}),
          },
        });
        // Same row this transaction read — a concurrent confirm on the same
        // email would already have deleted it, and Prisma throws (P2025) on
        // a delete that matches nothing, which is exactly "someone beat us
        // to it" and belongs in the outer catch below, not swallowed here.
        await tx.pendingRegistration.delete({ where: { email } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictError("An account with that email already exists.");
        }
        if (error.code === "P2025") {
          throw new InvalidCodeError();
        }
      }
      throw error;
    }

    registrationsTotal.inc();
    return toPublicUser(await this.ensureAdminRole(user));
  }

  /** Re-sends the signup code onto the same pending row — a fresh code,
   * fresh attempt budget, fresh expiry. Silently a no-op (same observable
   * 204 either way) if nothing's pending for that email, or if one went out
   * too recently — no oracle for "is this email mid-signup". */
  async resendRegistrationCode(email: string): Promise<void> {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) return;
    if (this.issuedAt(pending).getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000) return;

    const code = generateCode();
    await this.prisma.pendingRegistration.update({
      where: { email },
      data: {
        codeHash: hashCode(code),
        attempts: 0,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000),
      },
    });
    await this.email.sendVerificationCode(pending.email, pending.displayName, code);
  }

  /** `PendingRegistration` has no dedicated "code issued at" column — it's
   * derived from `expiresAt`, which every issue/reissue sets to `now + TTL`
   * together, so the two never drift apart. */
  private issuedAt(pending: { expiresAt: Date }): Date {
    return new Date(pending.expiresAt.getTime() - VERIFICATION_CODE_TTL_MINUTES * 60_000);
  }

  async verifyCredentials(input: LoginInput): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    // Compare even when the user is missing to keep timing uniform.
    const hash = user?.passwordHash ?? "$2a$12$0000000000000000000000000000000000000000000000000000";
    const ok = await bcrypt.compare(input.password, hash);

    if (!user || !ok) {
      throw new UnauthorizedError("Wrong email or password.");
    }
    if (user.isBanned) {
      throw new UnauthorizedError("This account has been suspended.");
    }
    loginsTotal.inc({ method: "password" });
    return toPublicUser(await this.ensureAdminRole(user));
  }

  // -- email verification (signup) ---------------------------------------

  /** Confirms the 6-digit code sent at signup. Wrong/expired/already-used
   * codes and a used-up attempt budget all fail the same way (InvalidCodeError)
   * — nothing here distinguishes "wrong digit" from "too late" to an
   * attacker probing the endpoint. */
  async verifyEmail(userId: string, code: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return toPublicUser(user);

    await this.consumeCode(userId, "VERIFY_EMAIL", code);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    return toPublicUser(updated);
  }

  /** Re-sends the signup code — invalidates any still-outstanding one first,
   * so only the newest code a viewer was actually shown ever works. Rate
   * limited per account (not just per IP) via a floor between issues. */
  async resendVerificationCode(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) throw new ConflictError("This email is already verified.");
    await this.issueCode(user, "VERIFY_EMAIL");
  }

  // -- password reset ------------------------------------------------------

  /** Always succeeds from the caller's point of view, whether or not the
   * email belongs to an account — the only way to keep "forgot password"
   * from doubling as an account-enumeration oracle. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.telegramId) {
      // A Telegram-only account (see loginWithTelegram) has no real inbox
      // behind its placeholder email and no password screen to reach with
      // a code anyway — silently a no-op, same observable outcome either way.
      return;
    }
    await this.issueCode(user, "RESET_PASSWORD");
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new InvalidCodeError();

    await this.consumeCode(user.id, "RESET_PASSWORD", code);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  }

  // -- verification code internals -----------------------------------------

  private async issueCode(
    user: User,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
  ): Promise<void> {
    const recent = await this.prisma.verificationCode.findFirst({
      where: { userId: user.id, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return; // silently absorbed — the viewer already has a very recent code
    }

    const code = generateCode();
    await this.prisma.$transaction([
      // At most one live code per (user, purpose) — a fresh request retires
      // whatever was issued before it.
      this.prisma.verificationCode.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.verificationCode.create({
        data: {
          userId: user.id,
          purpose,
          codeHash: hashCode(code),
          expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000),
        },
      }),
    ]);

    if (purpose === "VERIFY_EMAIL") {
      await this.email.sendVerificationCode(user.email, user.displayName, code);
    } else {
      await this.email.sendPasswordResetCode(user.email, user.displayName, code);
    }
  }

  private async consumeCode(
    userId: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    code: string,
  ): Promise<void> {
    const row = await this.prisma.verificationCode.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!row || row.expiresAt < new Date()) throw new InvalidCodeError();
    if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) throw new InvalidCodeError();

    if (row.codeHash !== hashCode(code)) {
      await this.prisma.verificationCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new InvalidCodeError();
    }

    await this.prisma.verificationCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * "Sign in with Telegram". A returning telegramId logs straight in — its
   * name/avatar are never touched again here, only whatever the account
   * already has (a viewer may have since set their own). A first-time
   * telegramId creates an account, importing display name and photo *only*
   * because there is nothing of the viewer's own yet to overwrite; a
   * nickname and age aren't something the widget can ever provide, so
   * neither is guessed at or left half-set.
   */
  async loginWithTelegram(input: TelegramAuthInput): Promise<PublicUser> {
    if (!this.telegramBotToken) {
      throw new BadRequestError("Telegram sign-in isn't configured on this server.");
    }
    this.assertValidTelegramPayload(input, this.telegramBotToken);

    const telegramId = String(input.id);
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      if (existing.isBanned) {
        throw new UnauthorizedError("This account has been suspended.");
      }
      loginsTotal.inc({ method: "telegram" });
      return toPublicUser(await this.ensureAdminRole(existing));
    }

    const displayName =
      [input.first_name, input.last_name].filter(Boolean).join(" ").trim() ||
      `Telegram${telegramId.slice(-6)}`;

    const [avatarUrl, passwordHash] = await Promise.all([
      input.photo_url
        ? this.downloadTelegramAvatar(input.photo_url, telegramId)
        : defaultAvatarUrl(),
      // Never used to sign in with (Telegram is this account's only way in)
      // — just satisfies the column, which every account needs one of.
      bcrypt.hash(randomUUID(), BCRYPT_ROUNDS),
    ]);

    try {
      const user = await this.prisma.user.create({
        data: {
          // No real inbox behind this — Telegram never hands over an email
          // — but the column is required and unique, so a deterministic,
          // unreachable placeholder fills it rather than making email
          // nullable everywhere else in the app for one auth path.
          email: `tg-${telegramId}@telegram.local`,
          displayName,
          passwordHash,
          avatarUrl,
          telegramId,
          // There's no inbox to send a code to and nothing to confirm —
          // "unverified" would just be a permanent, unactionable nag.
          emailVerifiedAt: new Date(),
          ...(this.proForAll ? { proSince: new Date() } : {}),
        },
      });
      registrationsTotal.inc();
      loginsTotal.inc({ method: "telegram" });
      return toPublicUser(await this.ensureAdminRole(user));
    } catch (error) {
      // Someone else's login raced this one to the same telegramId — extremely
      // unlikely (one person, one Telegram account) but cheap to handle right.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.prisma.user.findUnique({ where: { telegramId } });
        if (raced) return toPublicUser(await this.ensureAdminRole(raced));
      }
      throw error;
    }
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedError("Your session is no longer valid.");
    // /auth/me is revalidated on every app load, so this is also where a ban
    // takes effect for someone who was already logged in — no need to check
    // it on every single authenticated request just for this.
    if (user.isBanned) throw new UnauthorizedError("This account has been suspended.");
    return toPublicUser(await this.ensureAdminRole(user));
  }

  /**
   * Permanently deletes the account and everything hung off it — library,
   * reviews, comments, sessions, achievements — via the same `onDelete:
   * Cascade` relations Prisma already enforces (see schema.prisma); nothing
   * here needs to enumerate them by hand. Requires the current password:
   * the frontend's own "type a phrase to confirm" step guards against a
   * misclick, but only a correct password proves it's actually the account
   * owner asking, not just whoever currently holds a valid bearer token.
   * A Telegram-only account (no real password behind it — see
   * loginWithTelegram) skips that check; there's no password to prove.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.telegramId) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new UnauthorizedError("Wrong password.");
    }

    await this.prisma.user.delete({ where: { id: userId } });
    accountsDeletedTotal.inc();

    // Best-effort — an orphaned avatar file is a disk-space nit, never worth
    // failing an already-completed deletion over.
    if (user.avatarUrl?.startsWith("/uploads/avatars/")) {
      const file = user.avatarUrl.split("?")[0]!.replace("/uploads/avatars/", "");
      await unlink(join(this.uploadsDir, file)).catch(() => undefined);
    }
  }

  /**
   * One-directional: promotes a matching email to ADMIN, but never demotes —
   * removing an email from ADMIN_EMAILS shouldn't silently undo a promotion
   * an admin later granted someone else through the admin panel itself.
   */
  private async ensureAdminRole(user: User): Promise<User> {
    if (user.role === "ADMIN") return user;
    if (!this.adminEmails.includes(user.email.toLowerCase())) return user;
    return this.prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }

  // -- Telegram internals ------------------------------------------------

  /**
   * https://core.telegram.org/widgets/login#checking-authorization —
   * every field except `hash` itself, sorted and joined as "key=value" lines,
   * HMAC-SHA256'd with SHA256(bot token) as the key. A mismatch means the
   * payload wasn't actually signed by Telegram for this bot.
   */
  private assertValidTelegramPayload(input: TelegramAuthInput, botToken: string): void {
    const { hash, ...rest } = input;
    const checkString = Object.entries(rest)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = createHash("sha256").update(botToken).digest();
    const computedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

    if (computedHash !== hash) {
      throw new UnauthorizedError("Telegram sign-in couldn't be verified.");
    }
    const ageSeconds = Date.now() / 1000 - input.auth_date;
    if (ageSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS || ageSeconds < -60) {
      throw new UnauthorizedError("This Telegram sign-in has expired — try again.");
    }
  }

  /**
   * Telegram's `photo_url` is only valid for a short window, so it's fetched
   * and re-hosted immediately rather than stored as-is (which would quietly
   * break once it expires). Falls back to a reaction gif — same as any other
   * new account — if the download doesn't work out; it never blocks signup.
   */
  private async downloadTelegramAvatar(url: string, telegramId: string): Promise<string> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      const ext = contentType.includes("png") ? "png" : "jpg";
      const buf = Buffer.from(await response.arrayBuffer());

      await mkdir(this.uploadsDir, { recursive: true });
      const file = `tg-${telegramId}.${ext}`;
      await writeFile(join(this.uploadsDir, file), buf);
      return `/uploads/avatars/${file}?v=${Date.now()}`;
    } catch {
      return defaultAvatarUrl();
    }
  }
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    emailVerified: user.emailVerifiedAt != null,
    isTelegramLinked: user.telegramId != null,
  };
}
