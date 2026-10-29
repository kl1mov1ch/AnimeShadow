import assert from "node:assert/strict";
import { test } from "node:test";

// The DB package exports a singleton; no connection is used by these mocks.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
const { SeoRenderer } = await import("../apps/api/src/seo/render.ts");

const show = {
  id: 7,
  slug: "7-jujutsu-kaisen",
  title: "Jujutsu Kaisen",
  titleEnglish: "Jujutsu Kaisen",
  titleJapanese: "呪術廻戦",
  titleLocalized: "Магическая битва",
  titleSynonyms: ["JJK"],
  type: "TV",
  airing: "AIRING",
  year: 2020,
  season: null,
  episodes: 24,
  duration: null,
  studios: ["MAPPA"],
  rating: "pg_13",
  score: 8.6,
  scoredBy: 1000,
  synopsis: "Юдзи Итадори проглатывает палец проклятия.",
  background: null,
  imageUrl: "https://shikimori.one/poster.jpg",
  imageLargeUrl: null,
  bannerImage: null,
  screenshots: ["https://shikimori.one/frame.jpg"],
  airedFrom: null,
  genres: [{ genreId: 1, genre: { id: 1, name: "Экшен" } }],
};
const sources = [
  { title: "AniLibria", kind: "voice", episodesCount: 12, episodeMeta: { "5": { title: "Проклятое чрево", durationSeconds: 1440 } } },
  { title: "Субтитры", kind: "subtitles", episodesCount: 12, episodeMeta: null },
];
const prisma = {
  anime: { findFirst: async () => show, findMany: async () => [] },
  playerSource: { findMany: async () => sources },
  comment: { findMany: async () => [] },
  libraryEntry: { aggregate: async () => ({ _avg: { score: null }, _count: { score: 0 } }) },
  watchAvailability: { findUnique: async () => ({ hasPlayer: true }) },
  $queryRaw: async () => [],
} as never;
const renderer = () => new SeoRenderer({ prisma, landing: {} as never });

test("each released episode has its own indexable page, the way people search for it", async () => {
  const page = await renderer().render("/anime/7-jujutsu-kaisen/episode/5");
  assert.equal(page.status, 200);
  const html = page.html!;
  assert.match(html, /<title>Магическая битва 5 серия — смотреть онлайн бесплатно \(2020\) \| AnimeShadow<\/title>/);
  assert.match(html, /<link rel="canonical" href="[^"]*\/anime\/7-jujutsu-kaisen\/episode\/5"/);
  assert.match(html, /"@type":"TVEpisode"/);
  assert.match(html, /"episodeNumber":5/);
  assert.match(html, /Проклятое чрево/);
  assert.match(html, /href="\/anime\/7-jujutsu-kaisen\/episode\/6" rel="next"/);
  assert.match(html, /href="\/anime\/7-jujutsu-kaisen\/episode\/4" rel="prev"/);
  assert.match(html, /href="\/studios\/anilibria"/);
});

test("an episode no player has yet is not a page, and a wrong address moves to the right one", async () => {
  const missing = await renderer().render("/anime/7-jujutsu-kaisen/episode/13");
  assert.equal(missing.status, 404);
  const moved = await renderer().render("/anime/7/episode/3");
  assert.equal(moved.status, 301);
  assert.equal(moved.redirect, "/anime/7-jujutsu-kaisen/episode/3");
});

test("the title page reads like the top results, links every episode and answers the usual questions", async () => {
  const page = await renderer().render("/anime/7-jujutsu-kaisen");
  const html = page.html!;
  assert.match(html, /<title>Магическая битва \(2020\) смотреть онлайн все серии бесплатно \| AnimeShadow<\/title>/);
  assert.match(html, /href="\/anime\/7-jujutsu-kaisen\/episode\/12"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /Сколько серий в аниме «Магическая битва»\?/);
  assert.match(html, /JJK/);
});
