import { prisma } from "../dist/index.js";

try {
  // These titles already have a known Kodik source; the playback API now
  // resolves its streams into the same custom player as AniLibria.
  const result = await prisma.watchAvailability.updateMany({
    where: {
      hasPlayer: true,
      hasCustomPlayer: false,
      AND: [
        {
          OR: [
            { provider: "kodik" },
            { anime: { playerSources: { some: { provider: "kodik" } } } },
          ],
        },
      ],
    },
    data: { hasCustomPlayer: true },
  });
  console.log(
    JSON.stringify({
      updated: result.count,
      titles: await prisma.anime.count(),
      customPlayer: await prisma.watchAvailability.count({
        where: { hasCustomPlayer: true },
      }),
    }),
  );
} finally {
  await prisma.$disconnect();
}
