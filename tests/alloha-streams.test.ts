import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "../apps/api/node_modules/fastify/fastify.js";
import { AllohaClient } from "../packages/alloha/src/index.ts";
import type { WatchSource } from "../packages/shared/src/watch.ts";
import {
  AllohaStreams,
  allohaJson,
  allohaMediaUrl,
  allohaNonce,
} from "../apps/api/src/services/alloha-streams.ts";

const files = {
  type: "serial",
  active: { id: 1, id_translation: 10, seasons: 2 },
  all: {
    "1": { "1": { t10: { id: 101, id_translation: 10 } } },
    "2": {
      "1": { t10: { id: 201, id_translation: 10 } },
      "3": { t10: { id: 203, id_translation: 10 } },
      "2": { t20: { id: 202, id_translation: 20 } },
    },
  },
};
const html = `<meta name="viewporti" content="abcdef"><script>const userParam={token:'public-token'}; const fileList = JSON.parse('${JSON.stringify(files)}');</script>`;
const source = {
  id: "alloha:10",
  title: "Студия",
  kind: "voice",
  format: "iframe",
  embedUrl: "https://theatre.stravers.live/serial/123",
  episodesCount: null,
} as WatchSource;

test("Alloha searches independently of Kodik and keeps real dub names when translation is a string", async () => {
  const client = new AllohaClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("name"), "Cowboy Bebop");
      assert.equal(url.searchParams.has("kp"), false);
      return Response.json({
        status: "success",
        data: {
          name: "Ковбой Бибоп",
          original_name: "Cowboy Bebop",
          year: 1998,
          category: 4,
          id_kp: "123",
          iframe: "https://theatre.stravers.live/serial/123",
          translation: "Anilibria, Субтитры",
          translation_iframe: {
            "10": {
              name: "Anilibria",
              iframe: "https://theatre.stravers.live/serial/123?translation=10",
            },
          },
        },
      });
    },
  });
  const result = await client.findByTitles(["Cowboy Bebop"], 1998, "TV");
  assert.equal(result?.kinopoiskId, 123);
  assert.deepEqual(result?.translations, [{ id: "10", name: "Anilibria" }]);
  assert.equal(await client.findByTitles(["Cowboy Bebop"], 1999, "TV"), null);
  assert.equal(await client.findByTitles(["Cowboy Bebop"], 1998, "MOVIE"), null);
});

test("Alloha rejects ambiguous independent matches rather than choosing another title", async () => {
  const client = new AllohaClient({
    fetchImpl: async (input) => {
      const name = new URL(String(input)).searchParams.get("name");
      return Response.json({
        status: "success",
        data: {
          name,
          year: 1998,
          category: 4,
          id_kp: name === "Cowboy Bebop" ? 123 : 456,
          iframe: "https://theatre.stravers.live/serial/123",
        },
      });
    },
  });
  assert.equal(
    await client.findByTitles(["Cowboy Bebop", "Ковбой Бибоп"], 1998, "TV"),
    null,
  );
});

test("Alloha data literals are parsed without evaluating scripts; CDN destinations are restricted", () => {
  assert.deepEqual(allohaJson(html, "fileList"), files);
  assert.deepEqual(
    allohaJson(`const fileList=JSON.parse('{"title":"It\\'s \\u0410"}')`, "fileList"),
    { title: "It's А" },
  );
  assert.throws(() =>
    allohaJson("const fileList=JSON.parse(globalThis.evil())", "fileList"),
  );
  assert.throws(() => allohaMediaUrl("https://127.0.0.1/video"));
  assert.throws(() => allohaMediaUrl("https://vkvideo.cloud.evil.test/video"));
  assert.throws(() => allohaMediaUrl("https://a.vkvideo.cloud:8000/video"));
  assert.throws(() => allohaMediaUrl("http://a.vkvideo.cloud/video"));
  assert.equal(
    allohaMediaUrl("segment.ts", "https://a.vkvideo.cloud/title/master.m3u8"),
    "https://a.vkvideo.cloud/title/segment.ts",
  );
  assert.equal(allohaNonce("a"), "a");
  assert.equal(allohaNonce("abcdef"), "cdbefa");
  assert.throws(() => allohaNonce("a".repeat(5000)));
});

test("Alloha exposes the active season's real episodes and coalesces catalogue reads", async () => {
  let requests = 0;
  const streams = new AllohaStreams(async () => {
    requests++;
    return new Response(html);
  });
  const [a, b] = await Promise.all([
    streams.getSources(7, [source]),
    streams.getSources(7, [source]),
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a[0]!.hlsEpisodes!), ["1", "3"]);
  assert.equal(a[0]!.format, "hls");
  assert.equal(a[0]!.embedUrl, "");
  assert.equal(a[0]!.providerPlayer, undefined);
});

test("Alloha resolves only the requested dub/episode, proxies nested HLS and rejects arbitrary assets", async (t) => {
  let posts = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/bnsi/")) {
      posts++;
      assert.ok(url.endsWith("/203"));
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("origin"), "https://theatre.stravers.live");
      assert.match(headers.get("Borth")!, /^[a-f0-9]{64}\|/);
      return Response.json({
        hlsSource: [
          {
            quality: {
              "720":
                "https://a.vkvideo.cloud/master.m3u8 or https://b.vkvideo.cloud/master.m3u8",
              "480": "http://127.0.0.1/private",
            },
          },
        ],
      });
    }
    if (url.includes("stravers.live")) return new Response(html);
    assert.equal(
      new Headers(init?.headers).get("origin"),
      "https://theatre.stravers.live",
    );
    if (url.endsWith("master.m3u8"))
      return new Response(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:5,\nsegment.ts\n',
      );
    if (url.endsWith("key.bin"))
      return new Response(new Uint8Array(16), {
        headers: { "content-type": "application/octet-stream" },
      });
    return new Response(new Uint8Array([0x47, 1, 2]), {
      headers: { "content-type": "video/mp2t" },
    });
  };
  const streams = new AllohaStreams(fetcher);
  await assert.rejects(() => streams.master(7, "10", 2, source.embedUrl));
  const [master, same] = await Promise.all([
    streams.master(7, "10", 3, source.embedUrl),
    streams.master(7, "10", 3, source.embedUrl),
  ]);
  assert.equal(master, same);
  assert.equal(posts, 1);
  assert.ok(!master.includes("vkvideo.cloud"));
  const app = Fastify();
  t.after(() => app.close());
  app.get(
    "/api/anime/:id/streams/alloha/session/:session/:asset",
    async (req, reply) => {
      const p = req.params as { id: string; session: string; asset: string };
      return streams.sendAsset(Number(p.id), p.session, p.asset, req, reply);
    },
  );
  const uri = master.split("\n").find((line) => line.startsWith("/api/"))!;
  const manifest = await app.inject(uri);
  assert.equal(manifest.statusCode, 200);
  assert.ok(manifest.body.startsWith("#EXTM3U"));
  assert.ok(!manifest.body.includes("vkvideo.cloud"));
  const segment = manifest.body.split("\n").find((line) => line.startsWith("/api/"))!;
  const media = await app.inject(segment);
  assert.equal(media.statusCode, 200);
  assert.deepEqual([...media.rawPayload], [0x47, 1, 2]);
  const key = /URI="([^"]+)"/.exec(manifest.body)![1]!;
  assert.equal((await app.inject(key)).rawPayload.length, 16);
  assert.equal(
    (await app.inject(uri.replace("/anime/7/", "/anime/8/"))).statusCode,
    404,
  );
  assert.equal((await app.inject(uri.slice(0, -24) + "a".repeat(24))).statusCode, 404);
});

test("Alloha failures become a recoverable 503 instead of a server error", async () => {
  const streams = new AllohaStreams(async () => {
    throw new Error("network down");
  });
  await assert.rejects(
    () => streams.master(7, "10", 1, source.embedUrl),
    (e: { statusCode?: number }) => e.statusCode === 503,
  );
});
