// Expand the catalogue far beyond the ~200 titles the initial seed pulls in.
// Shikimori's list endpoint (unlike detail) carries no genre data, but it
// does carry title/poster/score/type/year -- enough for browse, search-by-
// title, and trending. Genre backfill is a separate, slower pass (see
// heal-genres.mjs) so this stays fast and light on the API.
//
// Why this pages the way it does
// ------------------------------
// It used to split the target three ways across order=popularity, ranked and
// id, twenty pages each. Popularity and ranked return very nearly the same
// titles -- the most popular anime are the highest rated -- so two thirds of
// every run was spent re-upserting rows the other ordering had already
// fetched. Asking for 3000 landed somewhere near 2700 unique, and asking for
// 10000 would not have got much further, because the ceiling was the overlap
// and not the target.
//
// order=id enumerates the whole catalogue with no overlap at all, so that is
// what the deep paging runs on. Popularity still gets a short pass first, so
// a run that is interrupted early has the titles anyone would actually look
// for rather than whatever happens to hold the lowest ids.
import { ShikimoriClient, toAnimeSummary } from "@animeshadow/shikimori";
import { persistAnimeSummaries, prisma } from "../dist/index.js";

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (bulk seed)",
});

const TARGET = Number(process.env.BULK_SEED_TARGET ?? 3000);
const PAGE_SIZE = 50; // Shikimori's max page size
// Shikimori refuses page numbers past this, whatever the ordering.
const MAX_PAGE = 100_000 / PAGE_SIZE;
// Enough popular titles to make the catalogue useful immediately.
const POPULAR_PAGES = 12;

let touched = 0;

/** True when the catalogue has reached the target. */
async function reachedTarget() {
  return (await prisma.anime.count()) >= TARGET;
}

async function pageThrough(order, maxPages, { stopWhenTargetMet = true } = {}) {
  console.log(`-- order=${order} --`);
  for (let page = 1; page <= maxPages; page++) {
    let list;
    try {
      list = await shiki.listAnimes({ order, limit: PAGE_SIZE, page });
    } catch (error) {
      console.warn(`  page ${page}: request failed (${error.message}), skipping`);
      continue;
    }
    if (list.length === 0) {
      console.log(`  page ${page}: empty, end of this order`);
      return;
    }
    await persistAnimeSummaries(list.map(toAnimeSummary));
    touched += list.length;

    // Counting rows is the only honest progress figure: "seen" counts
    // duplicates, which is exactly what made the old script look like it had
    // fetched a thousand more titles than it had.
    if (page % 10 === 0 || page === 1) {
      const have = await prisma.anime.count();
      console.log(`  page ${page}: +${list.length} (catalogue now ${have})`);
      if (stopWhenTargetMet && have >= TARGET) {
        console.log(`  target ${TARGET} reached`);
        return;
      }
    }
  }
}

await pageThrough("popularity", POPULAR_PAGES, { stopWhenTargetMet: true });

if (!(await reachedTarget())) {
  // The deep pass. Pages needed is bounded by the target rather than fixed,
  // and the run stops the moment the catalogue is big enough.
  await pageThrough("id", Math.min(MAX_PAGE, Math.ceil(TARGET / PAGE_SIZE) + 40));
}

const total = await prisma.anime.count();
const missingImage = await prisma.anime.count({ where: { imageUrl: null } });
const missingGenres = await prisma.anime.count({ where: { genres: { none: {} } } });
console.log(
  `done: ${touched} rows touched, catalogue now has ${total} anime total ` +
    `(${missingImage} missing posters, ${missingGenres} missing genres -- run heal scripts next)`,
);
await prisma.$disconnect();
