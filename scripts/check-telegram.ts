import { env } from "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/src/index.js";

// Counts and response codes only: never print tokens, chat IDs, endpoints or proxy URLs.
try {
  console.log(JSON.stringify({ configured: Boolean(env.TELEGRAM_BOT_TOKEN), polling: env.TELEGRAM_BOT_POLLING ?? env.NODE_ENV === "production", proxy: env.TELEGRAM_API_URL !== "https://api.telegram.org", users: { login: await prisma.user.count({ where: { telegramId: { not: null } } }), chat: await prisma.user.count({ where: { telegramChatId: { not: null } } }), loginWithoutChat: await prisma.user.count({ where: { telegramId: { not: null }, telegramChatId: null } }), blocked: await prisma.user.count({ where: { telegramBlockedAt: { not: null } } }) } }));
  if (env.TELEGRAM_BOT_TOKEN) for (const method of ["getMe", "getWebhookInfo"]) {
    try {
      const response = await fetch(`${env.TELEGRAM_API_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { signal: AbortSignal.timeout(10_000) });
      const body = await response.json() as { ok?: boolean; error_code?: number; result?: { username?: string; url?: string; pending_update_count?: number } };
      console.log(JSON.stringify({ method, status: response.status, ok: Boolean(body.ok), errorCode: body.error_code ?? null, bot: body.result?.username ?? null, webhook: Boolean(body.result?.url), pending: body.result?.pending_update_count ?? null }));
    } catch { console.log(JSON.stringify({ method, reachable: false })); }
  }
} finally { await prisma.$disconnect(); }
