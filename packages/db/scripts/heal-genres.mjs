// One-off repair: an earlier version of the read-through browse cache wrote
// list-page results (which carry no genre data) straight over anime that had
// already been detail-synced with real genres, wiping their GenreOnAnime
// links in the process. Re-fetch full detail (which does carry genres) for
// every anime that currently has none.
import { ShikimoriClient } from "@animeshadow/shikimori";
import { persistAnimeDetail, prisma } from "../dist/index.js";
import { toAnimeDetail } from "../../shikimori/dist/mappers.js";

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (genre heal)",
});

const rows = await prisma.anime.findMany({
  where: { genres: { none: {} } },
  select: { id: true, title: true },
});
console.log(`healing genres for ${rows.length} anime with zero genre links`);

async function fetchWithRetry(id, attempts = 3) {
  let lastError;
  for (let a = 0; a < attempts; a++) {
    try {
      return await shiki.getAnime(id);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (a + 1)));
    }
  }
  throw lastError;
}

let fixed = 0;
let emptyUpstream = 0;
let errored = 0;
for (let i = 0; i < rows.length; i++) {
  const { id } = rows[i];
  try {
    const full = await fetchWithRetry(id);
    const detail = toAnimeDetail(full);
    await persistAnimeDetail(detail);
    if (detail.genresDetailed.length > 0) fixed++;
    else emptyUpstream++;
  } catch (error) {
    errored++;
    console.warn(`  ${id}: ${error.message}`);
  }
  if ((i + 1) % 50 === 0 || i === rows.length - 1) {
    console.log(
      `  ${i + 1}/${rows.length} — fixed ${fixed}, empty ${emptyUpstream}, errored ${errored}`,
    );
  }
}
console.log(
  `done: ${fixed} healed, ${emptyUpstream} genuinely empty upstream, ${errored} still failing after retries`,
);
await prisma.$disconnect();
