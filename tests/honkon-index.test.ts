import assert from "node:assert/strict";
import { test } from "node:test";
import type { KodikClient, KodikResult } from "../packages/kodik/src/index.ts";
import { HonkonService } from "../apps/api/src/services/honkon.service.ts";
import type { FastifyBaseLogger } from "fastify";
import {
  HONKON_CHANNEL,
  parseStudioFeed,
} from "../apps/api/src/services/studio-channel.ts";
import { resolveStudioIdentity } from "../apps/api/src/services/studio-identities.ts";
import type { PrismaClient } from "@animeshadow/db";
const row: KodikResult = {
  id: "serial-1",
  type: "anime-serial",
  title: "Anime",
  shikimori_id: "20",
  link: "https://kodikplayer.com/serial/1/hash",
  translation: { id: 4167, title: "hon-kon studio", type: "voice" },
  seasons: {
    "1": {
      episodes: {
        "1": "https://kodikplayer.com/seria/one/hash",
        "3": "https://kodikplayer.com/seria/three/hash",
      },
    },
  },
};
const promo: KodikResult = {
  ...row,
  id: "movie-2",
  title: "Anime — Трейлер",
  shikimori_id: null,
  seasons: undefined,
  link: "https://kodikplayer.com/video/2/hash",
};
const logger = { info() {}, warn() {} } as unknown as FastifyBaseLogger;

test("unlinked uploads require an exact alias, matching year and a unique catalogue result", async () => {
  let matches = [{ id: 100 }];
  let calls = 0;
  const prisma = {
    anime: {
      findMany: async (query: unknown) => {
        calls++;
        const encoded = JSON.stringify(query);
        assert.ok(encoded.includes('"year":2025'));
        assert.ok(encoded.includes('"equals":"Дьявол может плакать"'));
        assert.ok(!encoded.includes('"contains"'));
        return matches;
      },
    },
  } as unknown as PrismaClient;
  const upload = {
    ...row,
    title: "Дьявол может плакать (2025)",
    year: 2025,
    shikimori_id: null,
  };
  assert.equal(await resolveStudioIdentity(prisma, upload), 100);
  matches = [{ id: 100 }, { id: 101 }];
  assert.equal(await resolveStudioIdentity(prisma, upload), null);
  assert.equal(
    await resolveStudioIdentity(prisma, { ...upload, year: undefined }),
    null,
  );
  assert.equal(calls, 2);
});

test("official studio RSS imports videos without inventing anime identities and rejects a different channel", () => {
  const feed = `<feed><yt:channelId>${HONKON_CHANNEL}</yt:channelId><entry><yt:videoId>YLdXS7YH0Zw</yt:videoId><title>Русский тизер &quot;Голос сердца&quot;</title></entry><entry><yt:videoId>bad</yt:videoId><title>Broken</title></entry></feed>`;
  const videos = parseStudioFeed(feed);
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.youtubeId, "YLdXS7YH0Zw");
  assert.equal(videos[0]?.title, 'Русский тизер "Голос сердца"');
  assert.ok(!("animeId" in videos[0]!));
  assert.throws(
    () => parseStudioFeed(feed.replace(HONKON_CHANNEL, "OTHER")),
    /Unexpected/,
  );
});

test("an upload without catalogue identity keeps its real episode selection and cannot borrow another series", async () => {
  const upload = { ...row, id: "serial-404", shikimori_id: null };
  const checked: string[] = [];
  const service = new HonkonService(
    {
      listByTranslation: async () => ({ rows: [upload], total: 1, nextCursor: null }),
    } as unknown as KodikClient,
    {
      storeStudioGroups: async (groups) => {
        assert.equal(groups.length, 0);
      },
    },
    { importStudioSources: async () => undefined },
    logger,
    {
      resolve: async (url) => {
        checked.push(url);
        return { variants: { "720": "https://cdn.test/video.m3u8" } };
      },
    },
  );
  await service.refresh();
  assert.deepEqual(service.status().uploads[0]?.episodes, [1, 3]);
  await service.upload("serial-404", "3");
  assert.match(checked[0]!, /three/);
  await assert.rejects(service.upload("serial-404", "2"), /не найдена/);
  await assert.rejects(service.upload("serial-999", "1"), /не найдена/);
  assert.equal(checked.length, 1);
});

test("studio index follows every page, separates trailers, retains source identity and keeps a previous successful result on outage", async () => {
  const queries: Array<string | undefined> = [];
  let unavailable = false;
  const client = {
    listByTranslation: async (id: number, cursor?: string) => {
      assert.equal(id, 4167);
      queries.push(cursor);
      if (unavailable) throw Error("provider unavailable");
      return cursor
        ? { rows: [promo], total: 2, nextCursor: null }
        : { rows: [row], total: 2, nextCursor: "next" };
    },
  } as unknown as KodikClient;
  const imported: number[] = [];
  const service = new HonkonService(
    client,
    {
      storeStudioGroups: async (groups) => {
        assert.deepEqual(
          groups.map((g) => g.shikimoriId),
          [20],
        );
      },
    },
    {
      importStudioSources: async (group) => {
        imported.push(group.shikimoriId);
      },
    },
    logger,
  );
  await Promise.all([service.refresh(), service.refresh()]);
  assert.deepEqual(queries, [undefined, "next"]);
  assert.deepEqual(imported, [20]);
  assert.equal(service.status().indexed, 2);
  assert.equal(service.status().videos[0]?.id, "movie-2");
  assert.equal(
    service.status().videos[0]?.stream,
    "/api/studios/hon-kon/clips/movie-2/master.m3u8",
  );
  assert.ok(!JSON.stringify(service.status()).includes("kodikplayer.com"));
  unavailable = true;
  await service.refresh(true);
  assert.equal(service.status().unavailable, true);
  assert.equal(service.status().videos.length, 1);
});

test("studio audit checks real numbered episodes and promos, reporting a failed episode without inventing episode two", async () => {
  const checked: string[] = [];
  const service = new HonkonService(
    {
      listByTranslation: async () => ({
        rows: [row, promo],
        total: 2,
        nextCursor: null,
      }),
    } as unknown as KodikClient,
    { storeStudioGroups: async () => undefined },
    { importStudioSources: async () => undefined },
    logger,
    {
      resolve: async (link) => {
        checked.push(link);
        if (link.includes("three")) throw Error("unavailable");
        return { variants: { "720": "https://cdn.test/video.m3u8" } };
      },
    },
  );
  await service.audit();
  assert.equal(checked.length, 3);
  assert.equal(service.auditStatus().checked, 3);
  assert.deepEqual(
    service.auditStatus().failures.map((f) => f.episode),
    ["3"],
  );
  assert.equal(service.auditStatus().running, false);
  await assert.rejects(service.clip("serial-1"), /не найден/);
  assert.equal(
    (await service.clip("movie-2")).variants["720"],
    "https://cdn.test/video.m3u8",
  );
});
