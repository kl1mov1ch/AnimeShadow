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
  // A licensed Kodik direct-source credential, if this deployment has been
  // granted one. Server-only, never forwarded to the browser; unset (the
  // normal case) means Kodik plays in its own embed, which is the only way
  // its public API permits. See packages/kodik/src/direct.ts.
  KODIK_DIRECT_TOKEN: z.string().optional(),
  // Warm the watch-availability cache for the N most popular cached titles on boot.
  WATCH_WARM_LIMIT: z.coerce.number().int().nonnegative().default(120),
  /** How often the warm pass repeats. 0 disables the repeat (boot pass only),
   * which is what the service effectively did before this existed. */
  WATCH_WARM_INTERVAL_MS: z.coerce.number().int().nonnegative().default(900_000),
  // The catalogue from Kodik's own catalogue API: every anime it can play.
  // A full pass the first time and weekly (about five minutes), the most
  // recently updated rows every six hours. "false" turns it off.
  KODIK_CATALOG_SYNC: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // AniLibria's whole catalogue matched to ours, once a day: the site's own
  // player for every title AniLibria streams.
  // Where proxied pictures (Shikimori, Kinopoisk posters) are kept on disk,
  // and how big that may grow before the oldest go.
  IMAGE_CACHE_DIR: z.string().min(1).optional(),
  IMAGE_CACHE_MAX_MB: z.coerce.number().int().positive().default(2048),
  ANILIBRIA_CATALOG_SYNC: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Titles per warm-up pass whose synopsis and rating are filled in from
  // Shikimori (imported ones arrive without). 0 turns it off.
  DETAIL_WARM_LIMIT: z.coerce.number().int().nonnegative().default(300),
  /** Titles per pass whose banner/cover/accent colour get filled in from
   * AniList. Smaller than the watch limit because each one is a live external
   * lookup paced by that client's own rate limiter. */
  ARTWORK_WARM_LIMIT: z.coerce.number().int().nonnegative().default(60),

  // ---- Telegram Login Widget — https://core.telegram.org/widgets/login.
  // Optional: "Sign in with Telegram" simply doesn't verify without it.
  TELEGRAM_BOT_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),

  // ---- Search by frame (trace.moe). Optional key: without one the free tier
  // allows 100 searches a month per IP, one at a time — and a server's single
  // IP is shared by every visitor, so that is 100 a month for the whole site.
  TRACE_MOE_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),

  // ---- Transactional email (Resend: https://resend.com) — signup
  // verification codes and password reset codes. Optional: with no key set,
  // codes are logged to the console instead of emailed (see EmailService).
  RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  EMAIL_FROM: z.string().default("AnimeShadow <onboarding@resend.dev>"),
  // Public origin of the web app, for the one-click links inside emails.
  APP_URL: z
    .string()
    .url()
    .default("http://localhost:5173")
    .transform((value) => value.replace(/\/+$/, "")),

  // Comma-separated emails that get promoted to the "ADMIN" role the next
  // time they log in / load /auth/me — see AuthService.ensureAdminRole.
  // No manual SQL needed to bootstrap the first admin account.
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),

  // ---- Prometheus /metrics — empty = open (fine for local dev; set this in
  // production and scrape with a matching Authorization: Bearer header).
  METRICS_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),

  // ---- Where the admin dashboard reads the live curves from. Server-side
  // only — the browser never talks to Prometheus.
  PROMETHEUS_URL: z.string().url().default("http://127.0.0.1:9090"),
  // Third-party analytics. The VITE_* ids are public (they also go into the
  // web build, which loads the counters); the token below is a secret and
  // only ever used here, to show Yandex Metrica's numbers in the admin.
  VITE_YM_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  YM_OAUTH_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  VITE_GA_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  VITE_UMAMI_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  UMAMI_DASHBOARD_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  // SEO. Where the built web app lives (its index.html is the template for
  // the pages the API renders for search engines), the codes Yandex
  // Webmaster / Google Search Console / Bing ask to put on the site, and the
  // IndexNow key (any 8–128 letters/digits) for telling Yandex and Bing
  // about new pages.
  WEB_DIST_DIR: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  YANDEX_VERIFICATION: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  GOOGLE_SITE_VERIFICATION: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  BING_VERIFICATION: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  INDEXNOW_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^[A-Za-z0-9-]{8,128}$/).optional(),
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
