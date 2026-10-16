import "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/dist/index.js";
const limit = Math.max(1, Math.min(30, Number(process.argv[2] ?? 6)));
try {
  const candidates = await prisma.anime.findMany({ where: { airing: { not: "UPCOMING" }, OR: [
    { watchAvailability: null }, { watchAvailability: { hasCustomPlayer: false } },
  ] }, orderBy: { members: { sort: "desc", nulls: "last" } }, take: limit,
  select: { id: true, title: true } });
  let found = 0;
  for (const anime of candidates) {
    try {
      const response = await fetch(`http://127.0.0.1:4000/api/anime/${anime.id}/watch`, { signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (data.available) found++;
      console.log(JSON.stringify({ ...anime, status: response.status, available: data.available,
        pending: data.sourcesPending, providers: [...new Set((data.sources ?? []).map((s: { id: string }) => s.id.split(":")[0]))] }));
    } catch { console.log(JSON.stringify({ ...anime, error: "lookup_timeout_or_unavailable" })); }
  }
  console.log(JSON.stringify({ sampled: candidates.length, sourceListsFound: found }));
} finally { await prisma.$disconnect(); }
