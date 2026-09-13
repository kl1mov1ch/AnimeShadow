import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, type PrismaClient, type User } from "@animeshadow/db";
import type {
  LoginInput,
  PublicUser,
  RegisterInput,
  TelegramAuthInput,
} from "@animeshadow/shared";
import bcrypt from "bcryptjs";
import { BadRequestError, ConflictError, UnauthorizedError } from "../lib/errors.js";
import { fetchReactionGif, randomReactionCategory } from "../lib/reaction-gif.js";

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
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly proForAll: boolean;
  private readonly uploadsDir: string;
  private readonly telegramBotToken?: string | undefined;

  constructor(deps: AuthServiceDeps) {
    this.prisma = deps.prisma;
    this.proForAll = deps.proForAll ?? false;
    this.uploadsDir = deps.uploadsDir;
    this.telegramBotToken = deps.telegramBotToken;
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    // Independent of each other — run concurrently so the nekos.best call
    // doesn't add its own latency on top of the hash.
    const [passwordHash, avatarUrl] = await Promise.all([
      bcrypt.hash(input.password, BCRYPT_ROUNDS),
      defaultAvatarUrl(),
    ]);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          avatarUrl,
          // Open-testing mode: new accounts get PRO on by default, but they
          // can switch it off in Settings to see the free experience.
          ...(this.proForAll ? { proSince: new Date() } : {}),
        },
      });
      return toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError("An account with that email already exists.");
      }
      throw error;
    }
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
    return toPublicUser(user);
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
    if (existing) return toPublicUser(existing);

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
          ...(this.proForAll ? { proSince: new Date() } : {}),
        },
      });
      return toPublicUser(user);
    } catch (error) {
      // Someone else's login raced this one to the same telegramId — extremely
      // unlikely (one person, one Telegram account) but cheap to handle right.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.prisma.user.findUnique({ where: { telegramId } });
        if (raced) return toPublicUser(raced);
      }
      throw error;
    }
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedError("Your session is no longer valid.");
    return toPublicUser(user);
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
  };
}
