// One-off repair: Shikimori keeps separate Anime/Manga genre catalogs, and
// ~43 of ~50 genre names exist under BOTH with different ids (Ecchi = 9 for
// anime, 51 for manga). Our upsert used to dedup by "first writer wins",
// which grabbed whichever id happened to appear first in the raw API
// response -- often the wrong (manga) one. A genre stored under the manga id
// silently returns nothing when used as `?genre=<id>` against Shikimori's
// *anime* list endpoint, which is exactly why some genre filters "don't find
// anime" while their local cache (browse-from-cache) works fine.
//
// This re-fetches the real genre list, finds every name whose stored id
// doesn't match the Anime-typed id, and repoints it -- via a two-phase
// renumber (temporary negative ids first) so a batch of swaps can't collide
// with each other mid-transaction. GenreOnAnime.genreId has ON UPDATE
// CASCADE, so links follow automatically.
import { ShikimoriClient } from "@animeshadow/shikimori";
import { prisma } from "../dist/index.js";

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (genre id fix)",
});

const upstream = await shiki.getGenres();
const correctIdByName = new Map();
for (const g of upstream) {
  const name = g.russian || g.name;
  const isAnime = g.entry_type == null || g.entry_type === "Anime";
  // An Anime-typed id always wins, even over one already set from Manga.
  // Otherwise take whatever we see first, so themes/demographics (which
  // carry no entry_type at all) still end up with some id.
  if (isAnime || !correctIdByName.has(name)) {
    correctIdByName.set(name, g.id);
  }
}

const ours = await prisma.genre.findMany({ select: { id: true, name: true } });

const mismatches = ours
  .map((row) => ({ ...row, correctId: correctIdByName.get(row.name) }))
  .filter((row) => row.correctId != null && row.correctId !== row.id);

console.log(`${ours.length} genres in DB, ${mismatches.length} pointing at the wrong id`);

if (mismatches.length === 0) {
  console.log("nothing to fix");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  // Phase 1: move every affected row to a unique negative id (never used by
  // real Shikimori ids), so phase 2 can never hit a duplicate-key collision
  // no matter how the old/new ids overlap between different genres.
  for (const [i, row] of mismatches.entries()) {
    await tx.genre.update({ where: { id: row.id }, data: { id: -(i + 1) } });
  }
  // Phase 2: land each on its real id.
  for (const [i, row] of mismatches.entries()) {
    await tx.genre.update({ where: { id: -(i + 1) }, data: { id: row.correctId } });
  }
});

for (const row of mismatches) {
  console.log(`  ${row.name}: ${row.id} -> ${row.correctId}`);
}

const linkCount = await prisma.genreOnAnime.count();
console.log(`done. ${linkCount} genre links intact.`);
await prisma.$disconnect();
