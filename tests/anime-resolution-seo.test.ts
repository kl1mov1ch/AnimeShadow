import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/seo_resolution_tests";
const { SeoRenderer } = await import("../apps/api/src/seo/render.ts");
const { NotFoundError, UpstreamUnavailableError } =
  await import("../apps/api/src/lib/errors.ts");

const show = {
  id: 1535,
  slug: "1535-death-note",
  title: "Death Note",
  titleEnglish: "Death Note",
  titleJapanese: "DEATH NOTE",
  titleLocalized: "Тетрадь смерти",
  titleSynonyms: [],
  type: "TV",
  airing: "FINISHED",
  year: 2006,
  season: null,
  episodes: 37,
  duration: "23 мин.",
  studios: ["Madhouse"],
  rating: "pg_13",
  score: 8.6,
  scoredBy: 1000,
  synopsis: "Описание проверенного тайтла.",
  background: null,
  imageUrl: null,
  imageLargeUrl: null,
  bannerImage: null,
  screenshots: [],
  airedFrom: null,
  genres: [],
};

function fixture(initial: typeof show | null = null) {
  let row = initial;
  let reads = 0;
  let playerReads = 0;
  let hydrateCalls = 0;
  let released = 2;
  let hydrate: (
    id: number,
    lang: "ru",
    adult: boolean,
  ) => Promise<unknown> = async () => {
    throw new NotFoundError();
  };
  let beforeRead: (() => Promise<void>) | null = null;
  const lookups: unknown[] = [];
  const prisma = {
    anime: {
      findFirst: async ({ where }: { where: { id?: number; slug?: string } }) => {
        reads++;
        lookups.push(where);
        await beforeRead?.();
        return row && (where.id === row.id || where.slug === row.slug) ? row : null;
      },
      findMany: async () => [],
    },
    playerSource: {
      findMany: async () => {
        playerReads++;
        return [
          {
            title: "AniLibria",
            kind: "voice",
            episodesCount: released,
            episodeMeta: null,
          },
        ];
      },
    },
    comment: { findMany: async () => [] },
    libraryEntry: {
      aggregate: async () => ({ _avg: { score: null }, _count: { score: 0 } }),
    },
    watchAvailability: { findUnique: async () => ({ hasPlayer: true }) },
    $queryRaw: async () => [],
  };
  const renderer = new SeoRenderer({
    prisma: prisma as never,
    landing: {} as never,
    catalog: {
      getDiscover: async () => ({}),
      getAnimeById: async (id, lang, adult) => {
        hydrateCalls++;
        return hydrate(id, lang, adult);
      },
    },
  });
  return {
    renderer,
    setRow: (value: typeof show | null) => {
      row = value;
    },
    setHydrate: (value: typeof hydrate) => {
      hydrate = value;
    },
    setBeforeRead: (value: typeof beforeRead) => {
      beforeRead = value;
    },
    setReleased: (value: number) => {
      released = value;
    },
    counts: () => ({ reads, playerReads, hydrateCalls }),
    lookups,
  };
}

test("a real SSR404 disappears immediately when search has populated the title", async () => {
  const f = fixture();
  assert.equal((await f.renderer.render("/anime/1535-death-note")).status, 404);
  const readsAtMiss = f.counts().reads;
  f.setRow(show);
  const recovered = await f.renderer.render("/anime/1535-death-note");
  assert.equal(recovered.status, 200);
  assert.ok(f.counts().reads > readsAtMiss);
  assert.match(recovered.html!, /Тетрадь смерти/);
});

test("concurrent successful page loads share one lookup and retain the positive cache", async () => {
  const f = fixture(show);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.setBeforeRead(() => gate);
  const first = f.renderer.render("/anime/1535-death-note");
  const second = f.renderer.render("/anime/1535-death-note");
  await Promise.resolve();
  assert.equal(f.counts().reads, 1);
  release();
  const pages = await Promise.all([first, second]);
  assert.deepEqual(
    pages.map((page) => page.status),
    [200, 200],
  );
  assert.equal((await f.renderer.render("/anime/1535-death-note")).status, 200);
  assert.equal(f.counts().reads, 1);
});

test("a cold numeric title is hydrated by stable ID before serving its canonical page", async () => {
  const f = fixture();
  f.setHydrate(async (id, lang, adult) => {
    assert.deepEqual([id, lang, adult], [1535, "ru", false]);
    f.setRow(show);
    return show;
  });
  const page = await f.renderer.render("/anime/1535-death-note");
  assert.equal(page.status, 200);
  assert.equal(f.counts().hydrateCalls, 1);
  assert.equal(f.counts().reads, 2);
  assert.deepEqual(f.lookups, [{ id: 1535 }, { id: 1535 }]);
});

test("upstream failure is a recoverable503; definitive absence is an uncached404", async () => {
  const f = fixture();
  f.setHydrate(async () => {
    throw new UpstreamUnavailableError();
  });
  const unavailable = await f.renderer.render("/anime/1535-death-note");
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.html!, /временно недоступна/);
  assert.doesNotMatch(unavailable.html!, /Страница не найдена/);
  f.setHydrate(async () => {
    f.setRow(show);
    return show;
  });
  assert.equal((await f.renderer.render("/anime/1535-death-note")).status, 200);

  const missing = fixture();
  assert.equal((await missing.renderer.render("/anime/1535-death-note")).status, 404);
  assert.equal((await missing.renderer.render("/anime/1535-death-note")).status, 404);
  assert.equal(missing.counts().hydrateCalls, 2);
});

test("an old suffix resolves by stable ID and keeps its canonical redirect", async () => {
  const f = fixture(show);
  const page = await f.renderer.render("/anime/1535-obsolete-suffix");
  assert.deepEqual(page, { status: 301, redirect: "/anime/1535-death-note" });
  assert.deepEqual(f.lookups, [{ id: 1535 }]);
  assert.equal(f.counts().hydrateCalls, 0);
  assert.equal((await f.renderer.render("/anime/1535-obsolete-suffix")).status, 301);
  assert.equal(f.counts().reads, 1);
});

test("cold episode pages hydrate the title and still reject an unreleased episode", async () => {
  const f = fixture();
  f.setHydrate(async () => {
    f.setRow(show);
    return show;
  });
  assert.equal(
    (await f.renderer.render("/anime/1535-death-note/episode/3")).status,
    404,
  );
  assert.equal(f.counts().hydrateCalls, 1);
  f.setReleased(3);
  const released = await f.renderer.render("/anime/1535-death-note/episode/3");
  assert.equal(released.status, 200);
  assert.match(released.html!, /"episodeNumber":3/);
  assert.deepEqual(await f.renderer.render("/anime/1535-old/episode/2"), {
    status: 301,
    redirect: "/anime/1535-death-note/episode/2",
  });
});

test("episode content gates remain in force after hydration and movies redirect to the title", async () => {
  for (const rating of ["Rx - Hentai", "R+ - Mild Nudity"]) {
    const f = fixture();
    f.setHydrate(async () => {
      f.setRow({ ...show, rating });
      throw new NotFoundError();
    });
    assert.equal(
      (await f.renderer.render("/anime/1535-death-note/episode/1")).status,
      404,
    );
    assert.equal(f.counts().playerReads, 0);
  }
  const film = fixture({ ...show, type: "MOVIE" });
  assert.deepEqual(await film.renderer.render("/anime/1535-death-note/episode/1"), {
    status: 301,
    redirect: "/anime/1535-death-note",
  });
});

test("name-only and out-of-range references never trigger upstream name search or unsafe ID hydration", async () => {
  const f = fixture();
  for (const param of ["unknown-show", "0-title", "2147483648-title"]) {
    assert.equal((await f.renderer.render(`/anime/${param}`)).status, 404);
  }
  assert.equal(f.counts().hydrateCalls, 0);
  assert.deepEqual(f.lookups, [
    { slug: "unknown-show" },
    { slug: "0-title" },
    { slug: "2147483648-title" },
  ]);
});

test("a successful upstream lookup without a readable cached row remains temporary, not a false404", async () => {
  const f = fixture();
  f.setHydrate(async () => show);
  assert.equal((await f.renderer.render("/anime/1535-death-note")).status, 503);
  f.setRow(show);
  assert.equal((await f.renderer.render("/anime/1535-death-note")).status, 200);
});
