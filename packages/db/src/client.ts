import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/index.js";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres with `pnpm db:up`.",
    );
  }

  // Postgres itself defaults to max_connections=100; a handful of API
  // instances sharing that budget should each cap well under it. 20 is
  // comfortable for a single-instance deploy under a few hundred concurrent
  // users (most requests are short reads served from the read-through cache).
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? [
            { level: "warn", emit: "stdout" },
            { level: "error", emit: "stdout" },
          ]
        : [{ level: "error", emit: "stdout" }],
  });
}

// Reuse a single client across HMR / repeated imports in dev.
const globalForPrisma = globalThis as unknown as {
  __animeshadowPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__animeshadowPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__animeshadowPrisma = prisma;
}

/** Cheap round-trip used by the API health check. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
