import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type sharpType from "../apps/api/node_modules/sharp/lib/index.js";
import { fitFrameCrop, frameCropPixels } from "../apps/web/src/lib/frame-image.ts";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
// The DB package exports a singleton; no connection is used by this mock.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
const { FrameService } = await import("../apps/api/src/services/frame.service.ts");
const sharp = require("sharp") as typeof sharpType;
const logger = { warn() {} };
const prisma = { anime: { findMany: async () => [] } } as never;
const hit = { anilist: { id: 1, idMal: 21, title: { romaji: "One Piece" } }, episode: 3, from: 45, to: 48, similarity: 0.96, image: "https://api.trace.moe/image/test", video: "https://untrusted.example/clip" };
async function image(red = 255) {
  const bytes = await sharp(Buffer.from([red, 0, 0, 0, 120, 255]), { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

test("portrait screenshots get a centered landscape frame; crops stay inside the image", () => {
  const crop = fitFrameCrop(1080, 1920);
  assert.equal(crop.width, 1);
  assert.ok(Math.abs((crop.height * 1920) / 1080 - 9 / 16) < 0.0001);
  assert.deepEqual(frameCropPixels(100, 100, { x: -1, y: 0.9, width: 2, height: 1 }), { left: 0, top: 90, width: 100, height: 10 });
  assert.equal(fitFrameCrop(1920, 1080).width, 1);
});

test("identical frames share one lookup, map episode and sanitize remote media", async () => {
  let searches = 0, limits = 0;
  const service = new FrameService({ prisma, logger, fetchImpl: async (url) => {
    if (String(url).endsWith("/me")) { limits++; return Response.json({ concurrency: 1, quota: 100, quotaUsed: 0 }); }
    assert.ok(String(url).includes("cutBorders&anilistInfo"));
    searches++;
    return Response.json({ frameCount: 500, result: [hit, { ...hit, from: 90 }] });
  } });
  const data = await image();
  const [a, b] = await Promise.all([service.searchByFrame(data, false), service.searchByFrame(data, false)]);
  assert.deepEqual(a, b);
  assert.equal(a.results.length, 1);
  assert.equal(a.results[0]?.episode, 3);
  assert.equal(a.results[0]?.previewVideo, null);
  assert.equal(a.results[0]?.previewImage, hit.image);
  await service.searchByFrame(data, false);
  assert.equal(searches, 1);
  assert.equal(limits, 1);
});

test("no confident match triggers exactly one mirrored retry, then caches the answer", async () => {
  const uploads: Uint8Array[] = [];
  const service = new FrameService({ prisma, logger, fetchImpl: async (url, init) => {
    if (String(url).endsWith("/me")) return Response.json({ concurrency: 1, quota: 100, quotaUsed: 0 });
    uploads.push(init!.body as Uint8Array);
    return Response.json({ frameCount: 20, result: uploads.length === 1 ? [{ ...hit, similarity: 0.6 }] : [hit] });
  } });
  const data = await image();
  const found = await service.searchByFrame(data, false);
  assert.equal(uploads.length, 2);
  assert.notDeepEqual(uploads[0], uploads[1]);
  assert.equal(found.results[0]?.title, "One Piece");
  assert.equal(found.framesSearched, 40);
  await service.searchByFrame(data, false);
  assert.equal(uploads.length, 2);
});

test("last quota credit is not spent again by mirrored retry or a queued request", async () => {
  let searches = 0;
  const service = new FrameService({ prisma, logger, fetchImpl: async (url) => {
    if (String(url).endsWith("/me")) return Response.json({ concurrency: 1, quota: 1, quotaUsed: 0 });
    searches++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return Response.json({ frameCount: 20, result: [] });
  } });
  const a = await image(200), b = await image(100);
  const results = await Promise.allSettled([service.searchByFrame(a, false), service.searchByFrame(b, false)]);
  assert.equal(searches, 1);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(service.queue().running, 0);
  assert.equal(service.queue().waiting, 0);
});

test("corrupt uploads fail locally, provider failures release the queue for the next search", async () => {
  let searches = 0;
  const service = new FrameService({ prisma, logger, fetchImpl: async (url) => {
    if (String(url).endsWith("/me")) return Response.json({ concurrency: 1, quota: 100, quotaUsed: 0 });
    searches++;
    return searches === 1 ? new Response("busy", { status: 429 }) : Response.json({ frameCount: 20, result: [hit] });
  } });
  await assert.rejects(service.searchByFrame("data:image/png;base64,YmFk", false), /Не удалось прочитать/);
  assert.equal(searches, 0);
  const data = await image();
  await assert.rejects(service.searchByFrame(data, false), /Another frame search/);
  assert.equal(service.queue().running, 0);
  assert.equal((await service.searchByFrame(data, false)).results.length, 1);
});

test("hidden frame search redirects to the homepage in the published site", async () => {
  const { SeoRenderer } = await import("../apps/api/src/seo/render.ts");
  const renderer = new SeoRenderer({ prisma, landing: {} as never });
  const page = await renderer.render("/frame-search");
  assert.equal(page.status, 301);
  assert.equal(page.redirect, "/");
});
