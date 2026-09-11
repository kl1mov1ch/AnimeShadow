// Expand the catalogue far beyond the ~200 titles the initial seed pulls in.
// Shikimori's list endpoint (unlike detail) carries no genre data, but it
// does carry title/poster/score/type/year -- enough for browse, search-by-
// title, and trending. Genre backfill is a separate, slower pass (see
// heal-genres.mjs) so this stays fast and light on the API.
import { ShikimoriClient, toAnimeSummary } from "@animeshadow/shikimori";
import { persistAnimeSummaries, prisma } from "../dist/index.js";

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (bulk seed)",
});

const TARGET = Number(process.env.BULK_SEED_TARGET ?? 3000);
const PAGE_SIZE = 50; // Shikimori's max page size
const ORDERS = ["popularity", "ranked", "id"]; // variety; dedup happens on upsert by id
const PAGES_PER_ORDER = Math.ceil(TARGET / PAGE_SIZE / ORDERS.length);

let inserted = 0;
let seen = 0;

for (const order of ORDERS) {
  console.log(`-- order=${order} --`);
  for (let page = 1; page <= PAGES_PER_ORDER; page++) {
    let list;
    try {
      list = await shiki.listAnimes({ order, limit: PAGE_SIZE, page });
    } catch (error) {
      console.warn(`  page ${page}: request failed (${error.message}), skipping`);
      continue;
    }
    if (list.length === 0) {
      console.log(`  page ${page}: empty, end of this order`);
      break;
    }
    const summaries = list.map(toAnimeSummary);
    await persistAnimeSummaries(summaries);
    seen += summaries.length;
    inserted += summaries.length;
    if (page % 5 === 0 || page === 1) {
      console.log(`  page ${page}: +${summaries.length} (seen ${seen})`);
    }
  }
}

const total = await prisma.anime.count();
const missingImage = await prisma.anime.count({ where: { imageUrl: null } });
const missingGenres = await prisma.anime.count({ where: { genres: { none: {} } } });
console.log(
  `done: ${inserted} rows touched, catalogue now has ${total} anime total ` +
    `(${missingImage} missing posters, ${missingGenres} missing genres -- run heal scripts next)`,
);
await prisma.$disconnect();
