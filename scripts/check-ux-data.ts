import { env } from "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/src/index.js";
import { contentGuardWhere } from "../apps/api/src/lib/content-guard.js";
import { FactsService } from "../apps/api/src/services/facts.service.js";

try {
  const where = contentGuardWhere(true);
  const [total, available, direct, providers, dragon, facts] = await Promise.all([
    prisma.anime.count({ where }),
    prisma.anime.count({ where: { AND: [where, { watchAvailability: { hasPlayer: true } }] } }),
    prisma.anime.count({ where: { AND: [where, { playerSources: { some: { format: { in: ["hls", "mp4"] }, stable: { not: false } } } }] } }),
    prisma.playerSource.groupBy({ by: ["provider", "format"], _count: { _all: true } }),
    prisma.anime.findUnique({ where: { id: 223 }, select: { id: true, title: true, imageUrl: true, imageLargeUrl: true } }),
    new FactsService({ prisma }).random(100),
  ]);
  console.log(JSON.stringify({ total, available, cachedDirect: direct, providers, dragon, facts: { count: facts.total, unique: new Set(facts.facts.map(f => f.id)).size }, telegram: { configured: Boolean(env.TELEGRAM_BOT_TOKEN), polling: env.TELEGRAM_BOT_POLLING } }, null, 2));
  if (env.TELEGRAM_BOT_TOKEN) {
    const response = await fetch(`${env.TELEGRAM_API_URL}/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const me = response?.ok ? await response.json() as { ok?: boolean; result?: { username?: string } } : null;
    console.log(JSON.stringify({ telegramReachable: Boolean(me?.ok), telegramHttpStatus: response?.status ?? null, bot: me?.result?.username ?? null }));
  }
} finally { await prisma.$disconnect(); }
