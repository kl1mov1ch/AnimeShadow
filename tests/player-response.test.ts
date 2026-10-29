import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseWatchdog, SOURCE_RESPONSE_MS, STREAM_STALL_MS, STREAM_START_MS, watchMediaResponse } from "../apps/web/src/components/player/response-watchdog.ts";
import { FramePreview, seekTo } from "../apps/web/src/components/player/frame-preview.ts";

function globalStub(t: { after: (fn: () => void) => void }, key: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else Reflect.deleteProperty(globalThis, key);
  });
}

test("a cold Kodik manifest gets startup time, then stalls retain the three-second limit", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let failures = 0;
  const watch = new ResponseWatchdog(() => failures++, 20_000);
  watch.wait();
  t.mock.timers.tick(15_000);
  assert.equal(failures, 0);
  watch.useDelay(SOURCE_RESPONSE_MS);
  watch.progress();
  t.mock.timers.tick(2_999); assert.equal(failures, 0);
  t.mock.timers.tick(1); assert.equal(failures, 1);
});

test("an unanswered source fails after three seconds, once, while data extends the deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let failures = 0;
  const watch = new ResponseWatchdog(() => failures++);
  watch.wait();
  t.mock.timers.tick(SOURCE_RESPONSE_MS - 1);
  assert.equal(failures, 0);
  watch.progress();
  t.mock.timers.tick(SOURCE_RESPONSE_MS - 1);
  assert.equal(failures, 0);
  watch.wait(); // Repeated waiting events are not actual network progress.
  t.mock.timers.tick(1);
  assert.equal(failures, 1);
  watch.wait();
  t.mock.timers.tick(30_000);
  assert.equal(failures, 1);
});

test("ready, hidden, offline and destroyed players cannot trigger false switches", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let failures = 0;
  const watch = new ResponseWatchdog(() => failures++);
  watch.wait();
  watch.ready();
  t.mock.timers.tick(30_000);
  watch.wait();
  watch.suspend(true);
  t.mock.timers.tick(30_000);
  assert.equal(failures, 0);
  watch.suspend(false);
  t.mock.timers.tick(2_999);
  watch.destroy();
  t.mock.timers.tick(30_000);
  assert.equal(failures, 0);
});

test("a stall after playback began reloads the same stream instead of switching dubs", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalStub(t, "document", doc);
  globalStub(t, "window", new EventTarget());
  globalStub(t, "navigator", { onLine: true });
  const video = Object.assign(new EventTarget(), { paused: false, seeking: false, readyState: 4 });
  let failures = 0;
  let stalls = 0;
  const watch = watchMediaResponse(video as unknown as HTMLVideoElement, () => failures++, STREAM_START_MS, () => stalls++);
  video.dispatchEvent(new Event("loadeddata"));
  t.mock.timers.tick(10_000);
  video.dispatchEvent(new Event("waiting"));
  t.mock.timers.tick(2_000);
  video.paused = true;
  video.dispatchEvent(new Event("pause"));
  t.mock.timers.tick(60_000);
  assert.equal(stalls, 0);
  // A seek on a slow line is ordinary buffering, not a dead source.
  video.paused = false;
  video.seeking = true;
  video.dispatchEvent(new Event("seeking"));
  video.dispatchEvent(new Event("waiting"));
  t.mock.timers.tick(STREAM_STALL_MS - 1);
  video.dispatchEvent(new Event("progress"));
  t.mock.timers.tick(STREAM_STALL_MS - 1);
  assert.equal(stalls, 0);
  t.mock.timers.tick(1);
  assert.equal(stalls, 1);
  assert.equal(failures, 0);
  watch.destroy();
});

test("a source that never answers fails after its startup window", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalStub(t, "document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  globalStub(t, "window", new EventTarget());
  globalStub(t, "navigator", { onLine: true });
  const video = Object.assign(new EventTarget(), { paused: false, seeking: false, readyState: 0 });
  let failures = 0;
  const watch = watchMediaResponse(video as unknown as HTMLVideoElement, () => failures++);
  t.mock.timers.tick(STREAM_START_MS - 1);
  assert.equal(failures, 0);
  t.mock.timers.tick(1);
  assert.equal(failures, 1);
  watch.destroy();
});

test("preview seeking resolves an already decoded frame and cancels promptly on disposal", async () => {
  const video = Object.assign(new EventTarget(), { readyState: 2, currentTime: 5, duration: 60, seeking: false });
  assert.equal(await seekTo(video as unknown as HTMLVideoElement, 5, new AbortController().signal), true);
  const abort = new AbortController();
  video.readyState = 0;
  const pending = seekTo(video as unknown as HTMLVideoElement, 30, abort.signal);
  abort.abort();
  assert.equal(await pending, false);
});

test("MP4 previews use a video source directly and release the decoder on disposal", async (t) => {
  const probe = Object.assign(new EventTarget(), {
    muted: false, playsInline: false, preload: "", crossOrigin: "", style: { cssText: "" },
    src: "", currentTime: 5, duration: 60, readyState: 2, videoWidth: 192, seeking: false,
    canPlayType: () => "", pause: t.mock.fn(), removeAttribute: t.mock.fn(), load: t.mock.fn(), remove: t.mock.fn(),
  });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
  globalStub(t, "document", {
    createElement: (tag: string) => tag === "video" ? probe : { ...canvas },
    body: { appendChild() {} },
  });
  const previews = new FramePreview("/episode.mp4", () => false, "mp4");
  const drawn = new Promise<void>((resolve) => previews.subscribe(resolve));
  previews.request(5);
  await drawn;
  assert.equal(probe.src, "/episode.mp4");
  assert.equal(previews.nearest(5)?.exact, true);
  previews.destroy();
  assert.equal(probe.pause.mock.callCount(), 1);
  assert.equal(probe.removeAttribute.mock.calls[0]?.arguments[0], "src");
  assert.equal(previews.nearest(5), null);
});
