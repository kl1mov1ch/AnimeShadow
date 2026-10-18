import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KodikClient,
  toEpisodeMap,
  toWatchSources,
  type KodikResult,
} from "../packages/kodik/src/index.ts";

const row: KodikResult = {
  id: "serial-1",
  type: "anime-serial",
  title: "Unlimited Blade Works",
  shikimori_id: "22297",
  kinopoisk_id: "839108",
  year: 2014,
  link: "//kodikplayer.com/serial/1/hash/720p",
  episodes_count: 12,
  translation: { id: 1, title: "Studio", type: "voice" },
  seasons: {
    "0": {
      episodes: {
        "1": {
          link: "//kodikplayer.com/seria/100/prologue/720p",
          screenshots: ["prologue.jpg"],
        },
      },
    },
    "1": {
      episodes: {
        "1": { link: "//kodikplayer.com/seria/101/main/720p" },
        "2": "//kodikplayer.com/seria/102/main/720p",
      },
    },
  },
};

test("a separately catalogued prologue selects only the reviewed parent episode, preserving each dub", async () => {
  const queries: string[] = [];
  const client = new KodikClient({
    minIntervalMs: 0,
    fetchImpl: async (input) => {
      const id = new URL(String(input)).searchParams.get("shikimori_id")!;
      queries.push(id);
      return Response.json({
        results:
          id === "22297"
            ? [
                row,
                { ...row, id: "serial-2", translation: { ...row.translation, id: 2 } },
              ]
            : [],
      });
    },
  });
  const group = await client.getByShikimoriId(27821);
  assert.deepEqual(queries, ["27821", "22297"]);
  assert.equal(group?.shikimoriId, 27821);
  assert.equal(group?.primary.kinopoisk_id, null); // Don't attach Alloha's entire main season.
  const sources = toWatchSources(group!);
  assert.equal(sources.length, 2);
  for (const source of sources) {
    assert.equal(source.episodesCount, 1);
    assert.deepEqual(Object.keys(source.iframeEpisodes!), ["1"]);
    assert.equal(
      source.embedUrl,
      "//kodikplayer.com/seria/100/prologue/720p".replace(/^\/\//, "https://"),
    );
    assert.equal(source.iframeEpisodes?.["1"]?.url, source.embedUrl);
  }
});

test("missing specials cannot silently play the main season, and unrelated identities never borrow it", async () => {
  const client = new KodikClient({
    minIntervalMs: 0,
    fetchImpl: async (input) =>
      Response.json({
        results:
          new URL(String(input)).searchParams.get("shikimori_id") === "22297"
            ? [{ ...row, seasons: { "1": row.seasons!["1"] } }]
            : [],
      }),
  });
  assert.equal(await client.getByShikimoriId(27821), null);
  assert.equal(await client.getByShikimoriId(31389), null); // Sunny Day is a different special.
});

test("an exact provider identity wins over the parent mapping", async () => {
  let calls = 0;
  const exact = { ...row, shikimori_id: "27821" };
  const client = new KodikClient({
    minIntervalMs: 0,
    fetchImpl: async () => {
      calls++;
      return Response.json({ results: [exact] });
    },
  });
  assert.equal((await client.getByShikimoriId(27821))?.primary.id, row.id);
  assert.equal(calls, 1);
});

test("season-zero extras never overwrite or become a normal series episode", () => {
  assert.equal(
    toEpisodeMap(row)["1"]?.url,
    "https://kodikplayer.com/seria/101/main/720p",
  );
  assert.deepEqual(Object.keys(toEpisodeMap(row)), ["1", "2"]);
  assert.deepEqual(toEpisodeMap({ ...row, seasons: { "0": row.seasons!["0"]! } }), {});
});

test("duplicate episode URLs cannot clone a video and complementary rows keep missing episodes", () => {
  const duplicate = { ...row, seasons: { "1": { episodes: { "1": "//kodikplayer.com/seria/one/hash", "2": "//kodikplayer.com/seria/one/hash" } } } };
  assert.deepEqual(Object.keys(toEpisodeMap(duplicate)), ["1"]);
  const alternate = { ...row, episodes_count: 1, seasons: { "1": { episodes: { "3": "//kodikplayer.com/seria/three/hash" } } } };
  const sources = toWatchSources({ shikimoriId: 22297, primary: duplicate, translations: [duplicate, alternate] });
  assert.deepEqual(Object.keys(sources[0]!.iframeEpisodes!), ["1", "3"]);
  assert.equal(sources[0]!.episodesCount, 2);
});

test("title fallback rejects an unlinked sequel whose name merely contains the requested title", async () => {
  const client = new KodikClient({ minIntervalMs: 0, fetchImpl: async () => Response.json({ results: [{ ...row, shikimori_id: null, title: "Example Season 2", title_orig: null }] }) });
  assert.equal(await client.findByTitles(1, ["Example"], 2014), null);
});
