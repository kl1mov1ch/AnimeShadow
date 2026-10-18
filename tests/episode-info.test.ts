import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@animeshadow/db";
import { EpisodeInfoService, mergeEpisodeInfo, type EpisodeInfo } from "../apps/api/src/services/episode-info.service.ts";
import { preferredEpisodeTitle } from "../apps/web/src/lib/episode-title.ts";
import { requiredMbps } from "../apps/web/src/lib/stream-health.ts";
import { renderShell } from "../apps/api/src/seo/shell.ts";
import { fitSegments } from "../apps/web/src/lib/skip-times.ts";
import { allowHeroPreview } from "../apps/web/src/lib/hero-preview.ts";

test("hero respects data saving without hiding video on an imprecise 3G estimate", () => {
  assert.equal(allowHeroPreview({ saveData: true, downlink: 20 }), false);
  assert.equal(allowHeroPreview({ effectiveType: "2g" }), false);
  assert.equal(allowHeroPreview({ effectiveType: "3g", downlink: 10 }), true);
  assert.equal(allowHeroPreview({ downlink: 1 }), true);
  assert.equal(allowHeroPreview({ effectiveType: "4g", downlink: 10 }), true);
});

test("skip prompts reject missing duration, negative, nonfinite and out-of-bounds provider marks", () => {
  assert.deepEqual(fitSegments([], 0, { start: 0, stop: 90 }), []);
  assert.deepEqual(fitSegments([], 1440, { start: -5, stop: 90 }), []);
  assert.deepEqual(fitSegments([], 1440, { start: 10, stop: 1500 }), []);
  assert.deepEqual(fitSegments([{ kind: "op", start: NaN, stop: 90, length: 1440 }], 1440), []);
  assert.deepEqual(fitSegments([], 1440, { start: 30, stop: 120 }), [{ kind: "op", start: 30, stop: 120, exact: true }]);
});

test("SEO replaces nested boot markup in both legacy and marked production shells", () => {
  const boot = '<div id="root"><div class="boot"><div><span>影</span></div><div>AnimeShadow</div></div></div>';
  for (const content of [boot, `<!-- app-root:start -->${boot}<!-- app-root:end -->`, '<div id="root"></div>']) {
    const html = renderShell(`<html><head><title>Old</title><meta name="description" content="Old" /></head><body>${content}<script src="/app.js"></script></body></html>`, '<title>New</title><meta name="description" content="New" />', '<h1>Аниме $&</h1>');
    assert.ok(html.includes('<div id="root"><h1>Аниме $&</h1></div>'));
    assert.ok(!html.includes('class="boot"'));
    assert.ok(html.includes('<script src="/app.js"></script>'));
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
  }
});

const episode = (n: number): EpisodeInfo => ({ number: n, title: "First day", titleJa: null, synopsis: null, thumb: "https://media.kitsu.app/episodes/1.jpg", length: 24, airdate: null });

test("Russian episode titles replace English/generic labels without replacing a human Russian name", () => {
  assert.equal(preferredEpisodeTitle("First day", "Первый день", "ru"), "Первый день");
  assert.equal(preferredEpisodeTitle("Первый день", "Начало пути", "ru"), "Первый день");
  assert.equal(preferredEpisodeTitle("Серия 1", "Первый день", "ru"), "Первый день");
  assert.equal(preferredEpisodeTitle("1 серия", "Первый день", "ru"), "Первый день");
  assert.equal(preferredEpisodeTitle("Первый день", "Episode 1", "ru"), "Первый день");
});

test("sparse metadata fallback preserves known stills and episodes outside the new page", () => {
  const merged = mergeEpisodeInfo([episode(1), episode(2)], [{ ...episode(1), title: "New title", thumb: null }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.title, "New title");
  assert.equal(merged[0]?.thumb, episode(1).thumb);
});

test("connection estimates support real 1080/2K/4K, stream bitrate and faster playback", () => {
  assert.equal(requiredMbps(720, null), 2);
  assert.equal(requiredMbps(1080, null), 4);
  assert.equal(requiredMbps(1440, null), 8);
  assert.equal(requiredMbps(2160, null), 16);
  assert.ok(Math.abs(requiredMbps(720, 3_000_000, 2)! - 7.2) < 0.0001);
  assert.equal(requiredMbps(null, null), null);
  // Upscaled output is never an input to the bandwidth calculation.
  assert.equal(requiredMbps(720, null, 1.5), 3);
});

test("episode translation is returned on the first request and stored for later viewers", async () => {
  const translations: Array<{ field: string; value: string }> = [];
  let calls = 0;
  const prisma = {
    anime: { findUnique: async () => ({ episodeInfo: [episode(1)], episodeInfoAt: new Date(), airing: "FINISHED", type: "TV", screenshots: [] }) },
    animeTranslation: { findMany: async () => translations, createMany: async ({ data }: { data: typeof translations }) => translations.push(...data) },
  } as unknown as PrismaClient;
  const service = new EpisodeInfoService({ prisma, translateEnabled: true, logger: { warn() {} }, translator: { translate: async () => { calls++; return "Первый день"; } } });
  assert.equal((await service.get(1, "ru"))[0]?.title, "Первый день");
  assert.equal(service.pending(1), false);
  assert.equal((await service.get(1, "ru"))[0]?.title, "Первый день");
  assert.equal(calls, 1);
});

test("Kitsu outage falls back to the exact MAL id through Jikan, without fabricated images", async () => {
  let saved: unknown;
  const urls: string[] = [];
  const prisma = { anime: { findUnique: async () => ({ episodeInfo: null, episodeInfoAt: null, airing: "FINISHED", type: "TV", screenshots: [] }), update: async ({ data }: { data: unknown }) => { saved = data; } } } as unknown as PrismaClient;
  const service = new EpisodeInfoService({ prisma, translateEnabled: false, translator: { translate: async () => null }, logger: { warn() {} }, fetchImpl: async (input) => {
    const url = String(input); urls.push(url);
    if (url.startsWith("https://kitsu.io/")) return new Response("Unavailable", { status: 503 });
    return Response.json({ data: [{ mal_id: 1, title: "First day" }], pagination: { has_next_page: false } });
  } });
  const result = await service.get(5114, "en");
  assert.equal(result[0]?.title, "First day");
  assert.equal(result[0]?.thumb, null);
  assert.ok(urls.includes("https://api.jikan.moe/v4/anime/5114/episodes?page=1"));
  assert.ok(saved);
});

test("number-only Kitsu labels do not suppress real Jikan episode names or erase Kitsu frames", async () => {
  const urls: string[] = [];
  const prisma = { anime: {
    findUnique: async () => ({ episodeInfo: null, episodeInfoAt: null, airing: "AIRING", type: "TV", screenshots: [] }),
    update: async () => undefined,
  } } as unknown as PrismaClient;
  const service = new EpisodeInfoService({ prisma, translateEnabled: false, translator: { translate: async () => null }, logger: { warn() {} }, fetchImpl: async (input) => {
    const url = String(input); urls.push(url);
    if (url.includes("/mappings?")) return Response.json({ included: [{ id: "verified", type: "anime" }] });
    if (url.includes("kitsu.io")) return Response.json({ data: [{ attributes: { number: 1, canonicalTitle: "Episode 1", titles: { en: "Episode 1" }, thumbnail: { original: "https://media.kitsu.io/episode-1.jpg" } } }], meta: { count: 1 } });
    return Response.json({ data: [{ mal_id: 1, title: "A real episode name" }], pagination: { has_next_page: false } });
  } });
  const result = await service.get(5114, "en");
  assert.equal(result[0]?.title, "A real episode name");
  assert.equal(result[0]?.thumb, "https://media.kitsu.io/episode-1.jpg");
  assert.ok(urls.includes("https://api.jikan.moe/v4/anime/5114/episodes?page=1"));
});
