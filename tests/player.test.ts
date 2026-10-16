import assert from "node:assert/strict";
import { test } from "node:test";
import type Hls from "hls.js";
import type { WatchSource } from "../packages/shared/src/watch.ts";
import { dubName, hasEpisode, nativeVariantsFromMaster, resumePosition, sourcesForEpisode } from "../apps/web/src/lib/playback-sources.ts";
import { matchAnimeVost, AnimeVostSources } from "../apps/api/src/services/animevost-sources.ts";
import type { PrismaClient } from "@animeshadow/db";
import { boundedVideoRange } from "../apps/api/src/lib/video-response.ts";
import { attachEngine } from "../apps/web/src/components/player/hls-engine.ts";
import { parseDirectFeed, DirectSources, directProvidersSchema } from "../apps/api/src/services/direct-sources.ts";
import { kodikCustomSource, kodikMasterPlaylist } from "../apps/api/src/services/kodik-streams.ts";
import { effectiveQuality, qualityHeights, qualityLevel, qualityOutputHeight } from "../apps/web/src/lib/player-quality.ts";

test("video proxy preserves seek offsets, bounds chunks and rejects malformed ranges", () => {
  assert.equal(boundedVideoRange(undefined), null);
  assert.equal(boundedVideoRange("bytes=0-"), "bytes=0-2097151");
  assert.equal(boundedVideoRange("bytes=9000000-9005000"), "bytes=9000000-9005000");
  assert.equal(boundedVideoRange("bytes=-4096"), "bytes=-4096");
  assert.throws(() => boundedVideoRange("bytes=8-2"));
  assert.throws(() => boundedVideoRange("bytes=0-1,10-20"));
});

test("dub names lose quality labels while studio names remain intact", () => {
  assert.equal(dubName("AniDub · 720p"), "AniDub");
  assert.equal(dubName("Studio Band [1080p]"), "Studio Band");
  assert.equal(dubName("HDrezka Studio"), "HDrezka Studio");
  assert.equal(dubName("2x2"), "2x2");
});

test("AnimeVost accepts exact title/year/format, rejects ambiguous or different seasons", () => {
  const anime = { title: "Naruto", titleEnglish: null, titleLocalized: "Наруто", year: 2002, type: "TV" };
  const row = { id: 7, title: "Наруто / Naruto [1-220 из 220]", year: "2002", type: "ТВ" };
  assert.equal(matchAnimeVost([row], anime), 7);
  assert.equal(matchAnimeVost([{ ...row, year: "2007" }], anime), null);
  assert.equal(matchAnimeVost([{ ...row, title: "Наруто: Ураганные хроники / Naruto Shippuuden" }], anime), null);
  assert.equal(matchAnimeVost([row, { ...row, id: 8 }], anime), null);
  assert.equal(matchAnimeVost([row], { ...anime, type: "MOVIE" }), null);
});

test("AnimeVost uses a verified direct MP4, skips unknown episodes and unsafe hosts", async () => {
  const prisma = { anime: { findUnique: async () => ({ title: "Naruto", titleEnglish: null, titleLocalized: null, year: 2002, type: "TV" }) } } as unknown as PrismaClient;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith("/search")) return Response.json({ data: [{ id: 7, title: "Naruto [1-2]", year: "2002", type: "ТВ" }] });
    if (String(url).endsWith("/playlist")) return Response.json([
      { name: "1 серия", std: "http://video.animetop.info/123.mp4" },
      { name: "2 серия", std: "https://unsafe.example/456.mp4" },
      { name: "Трейлер", std: "https://video.animetop.info/789.mp4" },
    ]);
    return new Response(null, { status: 206, headers: { "content-type": "video/mp4" } });
  };
  const [source] = await new AnimeVostSources(prisma, { warn() {} }, fetcher).getSources(20);
  assert.equal(source?.format, "mp4");
  assert.deepEqual(source?.mediaEpisodes, { "1": "https://video.animetop.info/123.mp4" });
  assert.equal(source?.embedUrl, "");
  assert.equal(hasEpisode(source!, 1), true);
  assert.equal(hasEpisode(source!, 2), false);
});

test("1080p and 2K output require PRO, including a saved choice after expiry", () => {
  for (const height of [1080, 1440]) {
    assert.equal(effectiveQuality(String(height), false), "auto");
    assert.equal(qualityOutputHeight(String(height), false), null);
    assert.equal(qualityOutputHeight(String(height), true), height);
  }
  assert.equal(effectiveQuality("720", false), "720");
  assert.equal(qualityOutputHeight("auto", true), null);
  assert.equal(qualityOutputHeight("720", true), null);
});

test("PRO output chooses the best real source and keeps a single tile per resolution", () => {
  assert.equal(qualityLevel([360, 480, 720], "1080"), 2);
  assert.equal(qualityLevel([360, 720, 1080], "1440"), 2);
  assert.equal(qualityLevel([1440, 720, 1080], "1080"), 2);
  assert.equal(qualityLevel([360, 720], "auto"), -1);
  assert.deepEqual(qualityHeights([360, 720, 1080]), [1440, 1080, 720, 360]);
  assert.deepEqual(qualityHeights([720]), [1440, 1080, 720]);
});

test("Kodik uses a separate same-origin HLS endpoint for each stored episode and dub", () => {
  const mapped = kodikCustomSource(20, {
    id: "kodik:767", title: "Studio", kind: "voice", format: "iframe", embedUrl: "https://kodikplayer.com/serial/1/hash/720p",
    iframeEpisodes: { "1": { url: "https://kodikplayer.com/seria/2/a/720p", thumbs: [] }, "3": { url: "https://kodikplayer.com/seria/3/b/720p", thumbs: [] } },
    episodesCount: 3, quality: "720p", stable: true,
  });
  assert.equal(mapped?.format, "hls");
  assert.equal(mapped?.embedUrl, "");
  assert.equal(mapped?.iframeEpisodes, undefined);
  assert.equal(mapped?.hlsEpisodes?.["1"], "/api/anime/20/streams/kodik/767/1/master.m3u8");
  assert.equal(mapped?.hlsEpisodes?.["2"], undefined);
  assert.equal(mapped?.hlsEpisodes?.["3"], "/api/anime/20/streams/kodik/767/3/master.m3u8");
  assert.equal(kodikCustomSource(20, { ...mapped!, id: "../../example" }), null);
});

test("the master playlist preserves real source qualities without inventing 1080p", () => {
  const playlist = kodikMasterPlaylist({ "720": "https://cdn.example/720.m3u8", "360": "https://cdn.example/360.m3u8" });
  assert.ok(playlist.startsWith("#EXTM3U\n"));
  assert.ok(playlist.indexOf("360.m3u8") < playlist.indexOf("720.m3u8"));
  assert.ok(!playlist.includes("1080"));
  assert.deepEqual(nativeVariantsFromMaster(playlist, "http://localhost:4000/api/master.m3u8"), {
    "360": "https://cdn.example/360.m3u8", "720": "https://cdn.example/720.m3u8",
  });
});

const source: WatchSource = {
  id: "studio:a", title: "Studio", kind: "voice", format: "hls", embedUrl: "",
  hlsEpisodes: { "1": "https://video.example/1.m3u8", "3": "https://video.example/3.m3u8" },
  episodesCount: 12, quality: null, stable: null,
};
const provider = { id: "studio", urlTemplate: "https://api.example/{malId}", streamHosts: ["video.example"] };
const feed = { malId: 1, sources: [{ ...source, id: "dub-a" }] };

test("an absent HLS episode never uses a different episode or a planned count", () => {
  assert.equal(hasEpisode(source, 2), false);
  assert.equal(hasEpisode(source, 3), true);
  assert.equal(hasEpisode(source, 12), false);
  assert.deepEqual(sourcesForEpisode([source, { ...source, id: "backup", hlsEpisodes: { "2": "https://video.example/2.m3u8" } }], 2).map((s) => s.id), ["backup"]);
});

test("retry and source switching preserve positions in the opening and ending", () => {
  assert.equal(resumePosition(12, 1400, true), 12);
  assert.equal(resumePosition(1380, 1400, true), 1380);
  assert.equal(resumePosition(12, 1400, false), null);
  assert.equal(resumePosition(1380, 1400, false), null);
  assert.equal(resumePosition(1500, 1400, true), 1399.9);
  assert.equal(resumePosition(NaN, 1400, true), null);
});

test("direct feeds verify the title, stream hosts, expiry and unique source ids", () => {
  assert.equal(parseDirectFeed(feed, provider, 1).sources[0]?.id, "direct-studio:dub-a");
  assert.throws(() => parseDirectFeed(feed, provider, 2));
  assert.throws(() => parseDirectFeed(feed, { ...provider, streamHosts: ["other.example"] }, 1));
  assert.throws(() => parseDirectFeed({ ...feed, sources: [feed.sources[0], feed.sources[0]] }, provider, 1));
  assert.deepEqual(parseDirectFeed({ ...feed, expiresAt: new Date(25_000).toISOString() }, provider, 1, 0).sources, []);
  assert.equal(directProvidersSchema.safeParse([provider, provider]).success, false);
});

test("a failed provider does not hide a second provider, and simultaneous lookups share fetches", async () => {
  let requests = 0;
  const client = new DirectSources([provider, { ...provider, id: "broken", urlTemplate: "https://broken.example/{malId}" }], { warn() {} }, async (url) => {
    requests++;
    return String(url).includes("broken") ? new Response(null, { status: 503 }) : Response.json(feed);
  });
  const [first, second] = await Promise.all([client.getSources(1), client.getSources(1)]);
  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  assert.equal(requests, 2);
});

class FakeHls {
  static Events = { MANIFEST_PARSED: "manifest", LEVEL_SWITCHED: "level", FRAG_BUFFERED: "buffered", ERROR: "error", AUDIO_TRACKS_UPDATED: "audio", AUDIO_TRACK_SWITCHED: "audioSwitch", SUBTITLE_TRACKS_UPDATED: "subtitles", SUBTITLE_TRACK_SWITCH: "subSwitch" };
  static ErrorTypes = { NETWORK_ERROR: "network", MEDIA_ERROR: "media" };
  static instance: FakeHls;
  handlers = new Map<string, (...args: unknown[]) => void>();
  levels: Array<{ height: number }> = [];
  audioTracks = [{ name: "Japanese", lang: "ja" }, { name: "Русский", lang: "ru" }];
  subtitleTracks = [{ name: "Русский", lang: "ru" }];
  audioTrack = 0;
  subtitleTrack = -1;
  subtitleDisplay = false;
  currentLevel = -1;
  loadLevel = -1;
  loads = 0;
  starts = 0;
  stopped = false;
  config: Record<string, number>;
  constructor(config: Record<string, number>) { this.config = config; FakeHls.instance = this; }
  on(event: string, callback: (...args: unknown[]) => void) { this.handlers.set(event, callback); }
  emit(event: string, data: unknown = {}) { this.handlers.get(event)?.(event, data); }
  loadSource() { this.loads++; }
  startLoad() { this.starts++; }
  stopLoad() { this.stopped = true; }
  attachMedia() {}
  destroy() {}
}

test("page entry buffers five seconds, stays paused and resumes loading on one play", () => {
  let end = 3;
  const video = { currentTime: 0, buffered: { length: 1, start: () => 0, end: () => end } } as unknown as HTMLVideoElement;
  const handle = attachEngine(FakeHls as unknown as typeof Hls, video, "https://video.example/master.m3u8", {
    preloadOnly: true, onLevels() {}, onLevelSwitched() {}, onManifest() {}, onStatus() {}, onFatal() {},
  });
  const engine = FakeHls.instance;
  assert.equal(engine.config.maxBufferLength, 5);
  engine.emit("buffered");
  assert.equal(engine.stopped, false);
  end = 6; // Provider segments are indivisible; the boundary can exceed 5s.
  engine.emit("buffered");
  assert.equal(engine.stopped, true);
  handle.setPreloadOnly(false);
  assert.equal(engine.starts, 1);
  assert.ok(engine.config.maxBufferLength! > 5);
  handle.setPreloadOnly(false);
  assert.equal(engine.starts, 1);
  handle.destroy();
});

test("a missing master manifest is fetched again, and destroying cancels retries", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const handle = attachEngine(FakeHls as unknown as typeof Hls, { currentTime: 0 } as HTMLVideoElement, "https://video.example/master.m3u8", {
    onLevels() {}, onLevelSwitched() {}, onManifest() {}, onStatus() {}, onFatal() {},
  });
  const engine = FakeHls.instance;
  engine.emit("error", { fatal: true, type: "network", details: "manifestLoadError" });
  t.mock.timers.tick(1000);
  assert.equal(engine.loads, 2);
  assert.equal(engine.starts, 0);
  engine.emit("error", { fatal: true, type: "network", details: "manifestLoadError" });
  handle.destroy();
  t.mock.timers.tick(10_000);
  assert.equal(engine.loads, 2);
});

test("audio and subtitle choices drive the stream and allow subtitles to be disabled", () => {
  const handle = attachEngine(FakeHls as unknown as typeof Hls, { currentTime: 0 } as HTMLVideoElement, "https://video.example/master.m3u8", {
    onLevels() {}, onLevelSwitched() {}, onManifest() {}, onStatus() {}, onFatal() {},
  });
  const engine = FakeHls.instance;
  handle.setAudioTrack(1);
  assert.equal(engine.audioTrack, 1);
  handle.setAudioTrack(99);
  assert.equal(engine.audioTrack, 1);
  handle.setSubtitleTrack(0);
  assert.equal(engine.subtitleTrack, 0);
  assert.equal(engine.subtitleDisplay, true);
  handle.setSubtitleTrack(-1);
  assert.equal(engine.subtitleDisplay, false);
  handle.destroy();
});
