import assert from "node:assert/strict";
import { test } from "node:test";
import { episodeProgress, episodeProgressKey, runtimeSeconds } from "../apps/web/src/lib/episode-progress.ts";

test("saved positions use the actual episode duration, support seeking backwards and fill a completed row", () => {
  assert.deepEqual(episodeProgress({ position: 450, duration: 1800, completed: false }, true, 1440), { position: 450, fraction: .25, completed: false });
  assert.equal(episodeProgress({ position: 30, duration: 1800, completed: false }, true).fraction, 1 / 60);
  assert.equal(episodeProgress({ position: 99999, duration: 1800, completed: false }, true).fraction, 1);
  assert.equal(episodeProgress({ position: 450, duration: 1800, completed: true }, true).fraction, 1);
  assert.equal(episodeProgress({ position: 450, completed: false }, true).fraction, 0);
  assert.equal(episodeProgress({ position: Number.NaN, completed: false }, true, 1800).fraction, 0);
});

test("guest rows cannot expose cached account timestamps and query keys isolate accounts", () => {
  assert.deepEqual(episodeProgress({ position: 450, duration: 1800, completed: true }, false), { position: 0, fraction: 0, completed: false });
  assert.notDeepEqual(episodeProgressKey(1, "account-a"), episodeProgressKey(1, "account-b"));
  assert.notDeepEqual(episodeProgressKey(1, "account-a"), episodeProgressKey(1));
});

test("duration fallback accepts real movie lengths and does not invent a typical runtime", () => {
  assert.equal(runtimeSeconds("1 час 30 мин."), 5400);
  assert.equal(runtimeSeconds("24 мин."), 1440);
  assert.equal(runtimeSeconds("90 min"), 5400);
  assert.equal(runtimeSeconds(null), null);
  assert.equal(runtimeSeconds("неизвестно"), null);
});
