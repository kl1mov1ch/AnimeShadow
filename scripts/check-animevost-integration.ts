import "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/dist/index.js";
import { AnimeVostSources } from "../apps/api/src/services/animevost-sources.js";
const id = Number(process.argv[2] ?? 20);
try {
  const identity = await prisma.anime.findUnique({ where: { id }, select: { title: true, titleEnglish: true, titleLocalized: true, year: true, type: true, airing: true } });
  console.log(JSON.stringify({ identity }));
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    console.log(JSON.stringify({ host: new URL(String(input)).hostname, status: response.status, type: response.headers.get("content-type") }));
    if (String(input).endsWith("/playlist")) {
      const data = await response.clone().json();
      console.log(JSON.stringify({ first: data[0] && { name: data[0].name, protocol: new URL(data[0].std).protocol } }));
    }
    return response;
  };
  const sources = await new AnimeVostSources(prisma, { warn: (data, message) => console.log(JSON.stringify({ data, message })) }, fetcher).getSources(id);
  console.log(JSON.stringify({ sources: sources.map(s => ({ id: s.id, title: s.title, format: s.format, episodes: Object.keys(s.mediaEpisodes ?? {}).length })) }));
  const counts = await prisma.anime.groupBy({ by: ["airing", "type"], where: { OR: [{ watchAvailability: null }, { watchAvailability: { hasCustomPlayer: { not: true } } }] }, _count: true });
  console.log(JSON.stringify({ missingByStatusAndType: counts }));
} finally { await prisma.$disconnect(); }
