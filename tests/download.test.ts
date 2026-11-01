import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { downloadRange } from "../apps/api/src/lib/download-file.ts";
import {
  downloadAssetUrl,
  downloadFilename,
  downloadVariant,
  registerAnimeDownloads,
  rewriteDownloadManifest,
  selectDownloadPlaylist,
} from "../apps/api/src/routes/anime-download.ts";

const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const Fastify = requireApi("fastify");

test("downloads keep a real quality and sanitize filenames and nested URLs", () => {
  assert.deepEqual(downloadRange("bytes=10-19", 100), {
    start: 10,
    end: 19,
    partial: true,
  });
  assert.deepEqual(downloadRange("bytes=90-", 100), {
    start: 90,
    end: 99,
    partial: true,
  });
  assert.deepEqual(downloadRange("bytes=-10", 100), {
    start: 90,
    end: 99,
    partial: true,
  });
  for (const value of ["bytes=100-", "bytes=5-3", "bytes=0-1,5-6", "bytes=-0"])
    assert.equal(downloadRange(value, 100), null);
  assert.equal(
    downloadVariant(
      {
        360: "https://cdn.example.org/360.m3u8",
        720: "https://cdn.example.org/720.m3u8",
      },
      480,
    ),
    "https://cdn.example.org/360.m3u8",
  );
  assert.equal(
    downloadVariant({
      360: "https://cdn.example.org/360.m3u8",
      720: "https://cdn.example.org/720.m3u8",
    }),
    "https://cdn.example.org/720.m3u8",
  );
  assert.equal(
    downloadFilename('Название / тест\r\n"', 2),
    "Название  тест — серия 2.mp4",
  );
  const master =
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360\n360.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720\n720.m3u8\n";
  assert(selectDownloadPlaylist(master, 480).includes("360.m3u8"));
  assert(!selectDownloadPlaylist(master, 480).includes("720.m3u8"));
  assert(selectDownloadPlaylist(master).includes("720.m3u8"));
  const roots = new Set(["https://cdn.example.org"]);
  for (const uri of [
    "file:///etc/passwd",
    "http://127.0.0.1/admin",
    "https://other.example.org/file",
    "https://user:pass@cdn.example.org/file",
  ])
    assert.throws(() =>
      downloadAssetUrl(
        uri,
        "https://cdn.example.org/a/master.m3u8",
        roots,
        "http://127.0.0.1:4000",
        1,
      ),
    );
  const seen: string[] = [];
  const text = rewriteDownloadManifest(
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg.ts\n',
    "https://cdn.example.org/a/master.m3u8",
    (uri, base) => {
      seen.push(new URL(uri, base).href);
      return "http://127.0.0.1/opaque";
    },
  );
  assert.deepEqual(seen, [
    "https://cdn.example.org/a/key.bin",
    "https://cdn.example.org/a/seg.ts",
  ]);
  assert(!text.includes("key.bin"));
});

test("PRO download authorization, one-use links and real HLS to MP4 streaming", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "animeshadow-download-"));
  const savedFetch = globalThis.fetch;
  const app = Fastify({ logger: false });
  let paid = true,
    banned = false,
    sourceCalls = 0;
  const source = {
    id: "fixture:1",
    format: "hls",
    hlsEpisodes: { "1": "https://cdn.example.org/master.m3u8" },
  };
  const sources: Array<{
    id: string;
    format: string;
    hlsEpisodes?: Record<string, string>;
    mediaEpisodes?: Record<string, string>;
  }> = [source];
  app.decorate("prisma", {
    user: {
      findUnique: async () => ({
        proSince: paid ? new Date() : null,
        proUntil: null,
        trialUntil: null,
        isBanned: banned,
      }),
    },
    anime: { findFirst: async () => ({ title: "Test", titleLocalized: "Тест" }) },
  });
  app.decorate("authenticate", async (req: { userId?: string }) => {
    req.userId = "qa-user";
  });
  await app.register(
    async (api: Parameters<typeof registerAnimeDownloads>[0]) =>
      registerAnimeDownloads(api, {
        getAllohaMaster: async () =>
          "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360\n/api/anime/1/streams/alloha/session/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaa\n",
        getSources: async () => {
          sourceCalls++;
          return { sources };
        },
      } as never),
    { prefix: "/api" },
  );
  try {
    const ffmpeg = requireApi("ffmpeg-static");
    const generated = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x90:rate=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=44100",
        "-t",
        "0.6",
        "-threads",
        "1",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-f",
        "hls",
        "-hls_time",
        "1",
        "-hls_list_size",
        "0",
        join(fixtureDir, "master.m3u8"),
      ],
      { windowsHide: true, timeout: 60000 },
    );
    assert.equal(generated.status, 0, generated.stderr?.toString());
    const mp4Fixture = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        join(fixtureDir, "master0.ts"),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        join(fixtureDir, "video.mp4"),
      ],
      { windowsHide: true, timeout: 60000 },
    );
    assert.equal(mp4Fixture.status, 0, mp4Fixture.stderr?.toString());
    const assets = new Map(
      await Promise.all(
        (await readdir(fixtureDir)).map(
          async (file) => [file, await readFile(join(fixtureDir, file))] as const,
        ),
      ),
    );
    globalThis.fetch = (async (url, options) => {
      const target = new URL(String(url));
      if (target.origin !== "https://cdn.example.org") return savedFetch(url, options);
      const file = target.pathname.slice(1),
        data = assets.get(file);
      return new Response(data ? new Uint8Array(data) : null, {
        status: data ? 200 : 404,
        headers: {
          "content-type": file.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : file.endsWith(".mp4")
              ? "video/mp4"
              : "video/mp2t",
        },
      });
    }) as typeof fetch;
    app.get(
      "/api/anime/1/streams/alloha/session/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/:asset",
      async (req, reply) => {
        if (req.headers.range === "bytes=0-") return reply.code(416).send();
        const asset = (req.params as { asset: string }).asset;
        if (asset === "aaaaaaaaaaaaaaaaaaaaaaaa")
          return reply.type("application/vnd.apple.mpegurl").send(
            assets
              .get("master.m3u8")!
              .toString()
              .replace(/master0.ts/g, "bbbbbbbbbbbbbbbbbbbbbbbb"),
          );
        return reply.type("video/mp2t").send(assets.get("master0.ts"));
      },
    );
    const post = () =>
      app.inject({
        method: "POST",
        url: "/api/anime/1/download",
        payload: { sourceId: sources[0]!.id, episode: 1 },
      });
    paid = false;
    assert.equal((await post()).statusCode, 403);
    assert.equal(sourceCalls, 0, "non-PRO never triggers provider resolution");
    paid = true;
    banned = true;
    assert.equal((await post()).statusCode, 403);
    banned = false;
    const issued = await post();
    assert.equal(issued.statusCode, 200);
    const stale = issued.json().url;
    paid = false;
    assert.equal(
      (await app.inject(stale)).statusCode,
      403,
      "PRO is checked again at download time",
    );
    paid = true;
    // A denied PRO check does not start the converter or consume another download slot.
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/anime/1/download",
          payload: { sourceId: "unknown:1", episode: 1 },
        })
      ).statusCode,
      404,
    );
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert(address && typeof address !== "string");
    const ticket = (await post()).json();
    assert(ticket.statusUrl.endsWith("/status"));
    const preparing = (await app.inject(ticket.statusUrl)).json();
    assert.equal(preparing.state, "preparing");
    const response = await savedFetch(`http://127.0.0.1:${address.port}${ticket.url}`);
    assert.equal(
      response.status,
      200,
      await (response.ok ? Promise.resolve("") : response.text()),
    );
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.match(
      response.headers.get("content-disposition")!,
      /attachment;.*filename\*=UTF-8''/,
    );
    const mp4 = Buffer.from(await response.arrayBuffer());
    assert.equal(mp4.toString("ascii", 4, 8), "ftyp");
    assert(mp4.length > 4000, "actual audio/video media was streamed");
    assert.equal(Number(response.headers.get("content-length")), mp4.length);
    assert.equal((await app.inject(ticket.statusUrl)).json().state, "ready");
    const resumed = await savedFetch(`http://127.0.0.1:${address.port}${ticket.url}`, {
      headers: { range: "bytes=1024-2047" },
    });
    assert.equal(resumed.status, 206);
    assert.equal(resumed.headers.get("content-range"), `bytes 1024-2047/${mp4.length}`);
    assert.deepEqual(
      Buffer.from(await resumed.arrayBuffer()),
      mp4.subarray(1024, 2048),
    );
    assert.equal((await app.inject(ticket.url)).statusCode, 404);
    sources[0] = { ...source, id: "alloha:7" };
    const allohaTicket = (await post()).json();
    const allohaResponse = await savedFetch(
      `http://127.0.0.1:${address.port}${allohaTicket.url}`,
    );
    assert.equal(
      allohaResponse.status,
      200,
      await (allohaResponse.ok ? Promise.resolve("") : allohaResponse.text()),
    );
    const allohaMp4 = Buffer.from(await allohaResponse.arrayBuffer());
    assert.equal(allohaMp4.toString("ascii", 4, 8), "ftyp");
    sources[0] = {
      id: "fixture:mp4",
      format: "mp4",
      mediaEpisodes: { "1": "https://cdn.example.org/video.mp4" },
    };
    const directTicket = (await post()).json();
    const directResponse = await savedFetch(
      `http://127.0.0.1:${address.port}${directTicket.url}`,
    );
    assert.equal(
      directResponse.status,
      200,
      await (directResponse.ok ? Promise.resolve("") : directResponse.text()),
    );
    const directMp4 = Buffer.from(await directResponse.arrayBuffer());
    assert.equal(directMp4.toString("ascii", 4, 8), "ftyp");
    assets.delete("master0.ts");
    sources[0] = source;
    const brokenTicket = (await post()).json();
    const broken = await savedFetch(
      `http://127.0.0.1:${address.port}${brokenTicket.url}`,
    );
    assert.equal(
      broken.status,
      503,
      "a missing fragment must never become a partial successful MP4",
    );
    assert.equal((await app.inject(brokenTicket.statusUrl)).json().state, "failed");
  } finally {
    globalThis.fetch = savedFetch;
    await app.close();
    assert(fixtureDir.startsWith(join(tmpdir(), "animeshadow-download-")));
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
