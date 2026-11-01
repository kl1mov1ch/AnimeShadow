import assert from "node:assert/strict";
import { test } from "node:test";
import { animeArtwork } from "../packages/db/src/anime-artwork.ts";
import {
  toAnimeRow,
  toAnimeListRow,
  toSummaryDto,
  toDetailDto,
  type AnimeWithGenres,
} from "../packages/db/src/catalog-mappers.ts";
import { toAnimeSummary } from "../packages/shikimori/src/mappers.ts";
import type { AnimeDetail } from "../packages/shared/src/anime.ts";

test("Shikimori image revision survives mapping so updated posters have a new cache key", () => {
  const anime = toAnimeSummary({
    id: 7,
    name: "Anime",
    image: {
      original: "/system/animes/original/7.jpg?1760000000",
      preview: "/system/animes/preview/7.jpg?1760000000",
    },
  } as Parameters<typeof toAnimeSummary>[0]);
  assert.match(anime.imageLargeUrl!, /7\.jpg\?1760000000$/);
  assert.match(anime.imageUrl!, /7\.jpg\?1760000000$/);
});

test("Jujutsu season artwork is corrected in list/detail writes and reads, without affecting other seasons", () => {
  const row = {
    id: 57658,
    imageUrl: "old-announcement",
    imageLargeUrl: "old-announcement-large",
    bannerImage: "old-red-banner",
    genres: [],
    screenshots: [],
    studios: [],
    themes: [],
    demographics: [],
  } as unknown as AnimeWithGenres;
  const art = animeArtwork(57658)!;
  assert.match(art.imageLargeUrl, /bx172463-/);
  assert.equal(toSummaryDto(row).imageUrl, art.imageUrl);
  assert.equal(toDetailDto(row).bannerImage, art.bannerImage);
  const detail = {
    ...toDetailDto(row),
    imageUrl: "provider-overwrite",
    imageLargeUrl: "provider-overwrite-large",
  } as AnimeDetail;
  assert.equal(toAnimeRow(detail).imageLargeUrl, art.imageLargeUrl);
  assert.equal(toAnimeListRow(detail).imageUrl, art.imageUrl);
  assert.equal(toAnimeRow(detail).bannerImage, art.bannerImage);
  const other = { ...row, id: 40748 };
  assert.equal(toSummaryDto(other).imageUrl, "old-announcement");
  assert.equal(toDetailDto(other).bannerImage, "old-red-banner");
});
