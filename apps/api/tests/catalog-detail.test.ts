import assert from "node:assert/strict";
import { test } from "node:test";
import { toAnimeRow, type AnimeWithGenres } from "@animeshadow/db";
import { ShikimoriError, toAnimeDetail } from "@animeshadow/shikimori";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/catalog_detail_tests";
const { CatalogService } = await import("../src/services/catalog.service.js");
const { NotFoundError, UpstreamUnavailableError, AgeVerificationRequiredError } =
  await import("../src/lib/errors.js");

function source(id = 1535, name = "Death Note") {
  return {
    id,
    name,
    russian: "Тетрадь смерти",
    kind: "tv",
    status: "released",
    rating: "pg_13",
    episodes: 37,
    duration: 23,
    image: { original: "/poster.jpg", preview: "/small.jpg" },
    genres: [],
    studios: [],
    videos: [],
    screenshots: [],
  } as unknown as Parameters<typeof toAnimeDetail>[0];
}
function stored(id = 1535, fresh = false): AnimeWithGenres {
  return {
    ...toAnimeRow(toAnimeDetail(source(id))),
    genres: [],
    bannerImage: "https://cdn.example/banner.jpg",
    accentColor: "#556677",
    detailSyncedAt: new Date(fresh ? Date.now() : 0),
  } as AnimeWithGenres;
}
function fixture(
  initial: AnimeWithGenres | null,
  getAnime: (id: number) => Promise<ReturnType<typeof source>>,
) {
  let row = initial;
  let reads = 0;
  let saves = 0;
  const service = new CatalogService({
    prisma: {
      anime: {
        findUnique: async () => {
          reads++;
          return row;
        },
      },
    } as never,
    shikimori: { getAnime } as never,
    anilist: { getByMalId: async () => null } as never,
    anilistBackground: {} as never,
    cacheTtlSeconds: 3600,
    logger: { warn: () => {}, info: () => {} },
    translation: { localizeDetail: async (detail) => detail } as never,
    translator: {} as never,
    persistDetail: async (detail) => {
      saves++;
      row = { ...stored(detail.id, true), ...toAnimeRow(detail) } as AnimeWithGenres;
      return row;
    },
  });
  return {
    service,
    setRow: (value: AnimeWithGenres | null) => {
      row = value;
    },
    reads: () => reads,
    saves: () => saves,
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test(
  "a stale catalogue row opens before upstream responds, shares concurrent reads and throttles failed refreshes",
  { timeout: 4000 },
  async () => {
    let reject!: (reason: unknown) => void;
    let calls = 0;
    const upstream = new Promise<ReturnType<typeof source>>((_, no) => {
      reject = no;
    });
    const f = fixture(stored(), () => {
      calls++;
      return upstream;
    });
    const results = await Promise.all(
      Array.from({ length: 12 }, () => f.service.getAnimeById(1535, "ru")),
    );
    assert.ok(results.every((row) => row.id === 1535));
    assert.equal(f.reads(), 1);
    assert.equal(calls, 1);
    reject(new ShikimoriError("temporarily missing", 404));
    await tick();
    assert.equal((await f.service.getAnimeById(1535, "ru")).id, 1535);
    assert.equal(calls, 1, "every visitor must not retry the failed provider");
  },
);

test("a background rename becomes visible on the next read without waiting on the first visit", async () => {
  let release!: (value: ReturnType<typeof source>) => void;
  const upstream = new Promise<ReturnType<typeof source>>((yes) => {
    release = yes;
  });
  const f = fixture(stored(), () => upstream);
  const first = await f.service.getAnimeById(1535, "ru");
  release(source(1535, "Renamed Death Note"));
  await tick();
  const next = await f.service.getAnimeById(1535, "ru");
  assert.equal(first.slug, "1535-death-note");
  assert.equal(next.slug, "1535-renamed-death-note");
  assert.equal(f.saves(), 1);
});

test("a title imported by search during a cold upstream404 is recovered with one DB reread", async () => {
  const f = fixture(null, async () => {
    f.setRow(stored());
    throw new ShikimoriError("not in this provider", 404);
  });
  assert.equal((await f.service.getAnimeById(1535, "ru")).id, 1535);
  assert.equal(f.reads(), 2);
});

test("real absence stays404, outage stays503, and neither prevents a later import from opening", async () => {
  for (const status of [404, 503]) {
    const f = fixture(null, async () => {
      throw new ShikimoriError("provider response", status);
    });
    await assert.rejects(
      f.service.getAnimeById(1535, "ru"),
      status === 404 ? NotFoundError : UpstreamUnavailableError,
    );
    f.setRow(stored());
    assert.equal((await f.service.getAnimeById(1535, "ru")).id, 1535);
  }
});

test("the cold path persists the exact requested identity and never accepts a different provider ID", async () => {
  const valid = fixture(null, async () => source());
  assert.equal((await valid.service.getAnimeById(1535, "ru")).id, 1535);
  assert.equal(valid.saves(), 1);
  const mismatch = fixture(null, async () => source(7));
  await assert.rejects(
    mismatch.service.getAnimeById(1535, "ru"),
    UpstreamUnavailableError,
  );
  assert.equal(mismatch.saves(), 0);
});

test("known content gates apply before background calls, including concurrent allowed and blocked reads", async () => {
  let calls = 0;
  const blocked = stored();
  blocked.rating = "Rx";
  const f = fixture(blocked, async () => {
    calls++;
    return source();
  });
  await assert.rejects(f.service.getAnimeById(1535, "ru", true), NotFoundError);
  assert.equal(calls, 0);
  const mature = stored(1535, true);
  mature.rating = "R+";
  f.setRow(mature);
  const [allowed, denied] = await Promise.allSettled([
    f.service.getAnimeById(1535, "ru", true),
    f.service.getAnimeById(1535, "ru", false),
  ]);
  assert.equal(allowed.status, "fulfilled");
  assert.equal(denied.status, "rejected");
  if (denied.status === "rejected")
    assert.ok(denied.reason instanceof AgeVerificationRequiredError);
});
