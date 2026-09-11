import {
  ShikimoriClient,
  toAnimeSummary,
  toGenreList,
} from "@animeshadow/shikimori";
import { persistAnimeSummaries, prisma, upsertGenres } from "../src/index.js";

// DATABASE_URL is injected by the `seed` script (`dotenv -e ../../.env`).

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (seed)",
});

async function seedGenres(): Promise<void> {
  const genres = toGenreList(await shiki.getGenres());
  await upsertGenres(genres);
  console.log(`  genres:        ${genres.length}`);
}

async function seedList(
  label: string,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    const list = await shiki.listAnimes(params);
    await persistAnimeSummaries(list.map(toAnimeSummary));
    console.log(`  ${label.padEnd(16)} ${list.length}`);
  } catch (error) {
    console.warn(`  ${label.padEnd(16)} skipped (${(error as Error).message})`);
  }
}

async function main(): Promise<void> {
  console.log("Seeding AnimeShadow catalogue from Shikimori…");

  await seedGenres();

  await seedList("most popular 1", { order: "popularity", limit: 50 });
  await seedList("most popular 2", { order: "popularity", limit: 50, page: 2 });
  await seedList("top ranked", { order: "ranked", limit: 50 });
  await seedList("ongoing", { status: "ongoing", order: "popularity", limit: 40 });
  await seedList("this year", {
    season: String(new Date().getUTCFullYear()),
    order: "popularity",
    limit: 40,
  });

  const [animeCount, genreCount] = await Promise.all([
    prisma.anime.count(),
    prisma.genre.count(),
  ]);
  console.log(`\nDone. ${animeCount} anime, ${genreCount} genres cached.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
