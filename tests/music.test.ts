import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnimeMusicService,
  themeMediaUrl,
} from "../apps/api/src/services/anime-music.ts";
import { MusicSession, type MusicTrack } from "../apps/web/src/lib/music-session.ts";
import { watchNavigationDestination } from "../apps/web/src/lib/watch-navigation.ts";

const opening = {
  kind: "OP" as const,
  url: "https://v.animethemes.moe/Test-OP1.webm",
  audioUrl: "https://a.animethemes.moe/Test-OP1.ogg",
  song: "Song",
  artist: "Artist",
  slug: "OP1",
  resolution: 720,
  size: 1000,
  pageUrl: "https://animethemes.moe/anime/test",
};
const successfulProbe: typeof fetch = async () =>
  new Response(new Uint8Array([79, 103, 103, 83]), {
    headers: { "content-type": "audio/ogg" },
  });
test("music uses exact title lookups, coalesces requests and returns only verified openings", async () => {
  let count = 0;
  const service = new AnimeMusicService(
    {
      getThemes: async (id) => {
        count++;
        assert.equal(id, 1535);
        return {
          tracks: [
            opening,
            { ...opening, kind: "ED" },
            { ...opening, url: "https://evil.test/video.webm", audioUrl: null },
          ],
          opening,
        };
      },
    },
    successfulProbe,
  );
  const [a, b] = await Promise.all([service.list(1535), service.list(1535)]);
  assert.deepEqual(a, b);
  assert.equal(count, 1);
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0]!.url, "/api/anime/1535/music/0/audio");
  assert.equal(a.items[0]!.fallbackUrl, "/api/anime/1535/music/0/video");
  assert.equal(await service.media(1535, 0, "audio"), opening.audioUrl);
  await assert.rejects(
    () => service.media(1535, 2, "audio"),
    (e: { statusCode?: number }) => e.statusCode === 404,
  );
  assert.equal(themeMediaUrl("https://a.animethemes.moe.evil.test/op.ogg"), null);
  assert.equal(themeMediaUrl("http://a.animethemes.moe/op.ogg"), null);
  assert.equal(themeMediaUrl("https://user:pass@a.animethemes.moe/op.ogg"), null);
});
test("a temporary music archive failure is retriable and never cached as an empty library", async () => {
  let count = 0;
  const service = new AnimeMusicService(
    {
      getThemes: async () =>
        ++count === 1
          ? { tracks: [], opening: null, error: "network unavailable" }
          : { tracks: [opening], opening },
    },
    successfulProbe,
  );
  await assert.rejects(
    () => service.list(1),
    (e: { statusCode?: number }) => e.statusCode === 503,
  );
  assert.equal((await service.list(1)).items.length, 1);
});

class FakeAudio extends EventTarget {
  src = "";
  crossOrigin = "";
  preload = "";
  volume = 1;
  paused = true;
  currentTime = 0;
  duration = 90;
  loads = 0;
  play = async () => {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  };
  pause = () => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  };
  load = () => {
    this.loads++;
  };
  removeAttribute = (key: string) => {
    if (key === "src") this.src = "";
  };
}
const queue: MusicTrack[] = [0, 1].map((i) => ({
  id: `1:OP${i}`,
  title: `Song ${i}`,
  artist: "Artist",
  label: `OP${i}`,
  url: `/op${i}.ogg`,
  fallbackUrl: `/op${i}.webm`,
  sourceUrl: null,
  animeId: 1,
  animeTitle: "Anime",
  animeHref: "/anime/1",
  cover: null,
}));
test("music survives route subscriber changes, pauses, seeks and switches tracks using one audio element", async () => {
  let created = 0;
  const audio = new FakeAudio();
  const session = new MusicSession(() => {
    created++;
    return audio as unknown as HTMLAudioElement;
  });
  const leaveFirstPage = session.subscribe(() => {});
  session.play(queue, 0);
  await Promise.resolve();
  audio.currentTime = 17;
  audio.dispatchEvent(new Event("timeupdate"));
  audio.dispatchEvent(new Event("durationchange"));
  leaveFirstPage();
  const leaveNextPage = session.subscribe(() => {});
  assert.equal(created, 1);
  assert.equal(audio.src, "/op0.ogg");
  assert.equal(session.getSnapshot().time, 17);
  assert.equal(session.getSnapshot().status, "playing");
  session.seek(25);
  assert.equal(audio.currentTime, 25);
  session.pause();
  assert.equal(session.getSnapshot().status, "paused");
  session.toggle();
  await Promise.resolve();
  assert.equal(session.getSnapshot().status, "playing");
  session.next();
  await Promise.resolve();
  assert.equal(audio.src, "/op1.ogg");
  assert.equal(created, 1);
  session.setVolume(2);
  assert.equal(audio.volume, 1);
  session.close();
  assert.equal(audio.src, "");
  assert.equal(audio.paused, true);
  assert.equal(session.getSnapshot().queue.length, 0);
  leaveNextPage();
});
test("a failed opening gets one format fallback and is then hidden while the next track plays", async () => {
  const audio = new FakeAudio();
  const session = new MusicSession(() => audio as unknown as HTMLAudioElement);
  session.play(queue, 0);
  await Promise.resolve();
  audio.dispatchEvent(new Event("error"));
  await Promise.resolve();
  assert.equal(audio.src, "/op0.webm");
  audio.dispatchEvent(new Event("error"));
  await Promise.resolve();
  assert.deepEqual(session.getSnapshot().failedIds, [queue[0]!.id]);
  assert.equal(session.getSnapshot().queue.length, 1);
  assert.equal(audio.src, "/op1.ogg");
  assert.equal(session.getSnapshot().status, "playing");
  audio.dispatchEvent(new Event("error"));
  await Promise.resolve();
  audio.dispatchEvent(new Event("error"));
  await Promise.resolve();
  assert.equal(session.getSnapshot().queue.length, 0);
  assert.equal(session.getSnapshot().status, "idle");
  assert.equal(session.getSnapshot().failedIds.length, 2);
});
test("music lists omit unavailable media and preserve original track identities after filtering", async () => {
  const service = new AnimeMusicService(
    {
      getThemes: async () => ({
        tracks: [
          {
            ...opening,
            url: "https://v.animethemes.moe/Missing.webm",
            audioUrl: "https://a.animethemes.moe/Missing.ogg",
          },
          {
            ...opening,
            slug: "OP2",
            url: "https://v.animethemes.moe/Fallback.webm",
            audioUrl: "https://a.animethemes.moe/Missing.ogg",
          },
        ],
        opening,
      }),
    },
    async (input) =>
      String(input).includes("Missing")
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), {
            headers: { "content-type": "video/webm" },
          }),
  );
  const result = await service.list(1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.id, "1:OP2:1");
  assert.equal(result.items[0]!.url, "/api/anime/1/music/1/video");
  assert.equal(
    await service.media(1, 1, "video"),
    "https://v.animethemes.moe/Fallback.webm",
  );
});
test("availability probing handles split media headers and hides HTML challenge pages", async () => {
  const service = new AnimeMusicService({ getThemes: async () => ({ tracks: [opening], opening }) }, async () =>
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([79, 103])); controller.enqueue(new Uint8Array([103, 83])); controller.close(); } }), { headers: { "content-type": "audio/ogg" } }));
  assert.equal((await service.list(1)).items.length, 1);
  const unavailable = new AnimeMusicService({ getThemes: async () => ({ tracks: [opening], opening }) }, async () => new Response("<html>blocked</html>", { headers: { "content-type": "text/html" } }));
  assert.equal((await unavailable.list(1)).items.length, 0);
});
test("watch navigation preserves internal route links without changing seek anchors, downloads or other sites", () => {
  const from = "https://animeshadow.online/anime/1?ep=2";
  assert.equal(
    watchNavigationDestination("/browse", from, null, false)?.pathname,
    "/browse",
  );
  assert.equal(
    watchNavigationDestination("/anime/2", from, "_self", false)?.pathname,
    "/anime/2",
  );
  for (const href of [
    "#openings",
    "https://other.test/browse",
    "javascript:alert(1)",
    "mailto:someone@example.test",
  ])
    assert.equal(watchNavigationDestination(href, from, null, false), null);
  assert.equal(watchNavigationDestination("/browse", from, "_blank", false), null);
  assert.equal(watchNavigationDestination("/browse", from, null, true), null);
});
