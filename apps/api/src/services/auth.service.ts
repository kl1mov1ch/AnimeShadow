import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type User } from "@animeshadow/db";
import type {
  LoginInput,
  PublicUser,
  RegisterInput,
} from "@animeshadow/shared";
import bcrypt from "bcryptjs";
import { ConflictError, UnauthorizedError } from "../lib/errors.js";

/** A distinct, cute character-style default avatar for every new account (until they upload their own). */
function defaultAvatarUrl(): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${randomUUID()}&radius=50&backgroundType=gradientLinear`;
}

const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly proForAll = false,
  ) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          avatarUrl: defaultAvatarUrl(),
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

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedError("Your session is no longer valid.");
    return toPublicUser(user);
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
