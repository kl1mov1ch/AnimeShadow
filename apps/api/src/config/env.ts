import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// The repo-root .env is shared by docker compose, Prisma and this server.
loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv(); // also honour a local apps/api/.env if present

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection string"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — generate a random one"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // ---- Metadata: Shikimori primary, Jikan fallback ----
  SHIKIMORI_BASE_URL: z.string().url().default("https://shikimori.io"),
  // Shikimori asks for a descriptive User-Agent identifying your app.
  SHIKIMORI_USER_AGENT: z
    .string()
    .default("AnimeShadow/1.0 (anime catalogue app)"),
  JIKAN_BASE_URL: z.string().url().default("https://api.jikan.moe/v4"),
  ANIME_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // TEMPORARY: unlock every PRO feature for all users during open testing.
  // Set PRO_FOR_ALL=false once payments are wired up.
  PRO_FOR_ALL: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // Machine translation of synopses (MyMemory — free, no key; email lifts quota)
  TRANSLATE_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  MYMEMORY_EMAIL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),

  // ---- Video player: Kodik primary + Alloha fallback (public webmaster
  // tokens are baked into the clients — nothing to buy; override for your own).
  KODIK_API_TOKEN: z.string().default("56a768d08f43091901c44b54fe970049"),
  KODIK_API_BASE: z.string().url().default("https://kodik-api.com"),
  ALLOHA_TOKEN: z.string().default("45e20a5f584becf7a64dffb7174ddf"),
  WATCH_EMBED_TEMPLATE: z.string().optional(),
  // Warm the watch-availability cache for the N most popular cached titles on boot.
  WATCH_WARM_LIMIT: z.coerce.number().int().nonnegative().default(120),

  // ---- Telegram Login Widget — https://core.telegram.org/widgets/login.
  // Optional: "Sign in with Telegram" simply doesn't verify without it.
  TELEGRAM_BOT_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
