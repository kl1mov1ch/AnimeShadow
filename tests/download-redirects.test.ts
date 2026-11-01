import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchDownloadAsset,
  publicDownloadAddress,
} from "../apps/api/src/lib/download-redirects.ts";
import { boundedWatchSession } from "../apps/api/src/lib/watch-session.ts";

test("download redirects stay within the verified CDN and reject private destinations and loops", async () => {
  const saved = globalThis.fetch;
  let mode = "ok",
    hits: string[] = [];
  globalThis.fetch = (async (value: unknown) => {
    const url = new URL(String(value));
    hits.push(url.href);
    if (url.hostname === "p14.solodcdn.com")
      return new Response(null, {
        status: 302,
        headers: { location: "https://p13.solodcdn.com/segment.ts" },
      });
    if (mode === "loop")
      return new Response(null, { status: 302, headers: { location: url.href } });
    if (url.hostname === "cloud.cdn.example.org")
      return new Response(null, {
        status: 302,
        headers: {
          location:
            mode === "foreign"
              ? "https://other.example.org/video"
              : mode === "lan"
                ? "http://127.0.0.1/admin"
                : "https://edge.cloud.cdn.example.org/a/index.m3u8",
        },
      });
    return new Response("#EXTM3U\nsegment.ts\n");
  }) as typeof fetch;
  try {
    const roots = new Set(["https://cloud.cdn.example.org"]);
    const sibling = await fetchDownloadAsset(
      "https://p14.solodcdn.com/segment.ts",
      {},
      new Set(["https://p14.solodcdn.com"]),
      async () => ["93.184.216.34"],
    );
    assert.equal(sibling.url, "https://p13.solodcdn.com/segment.ts");
    const result = await fetchDownloadAsset(
      "https://cloud.cdn.example.org/start",
      {},
      roots,
      async () => ["93.184.216.34"],
    );
    assert.equal(result.url, "https://edge.cloud.cdn.example.org/a/index.m3u8");
    assert(roots.has("https://edge.cloud.cdn.example.org"));
    assert.equal(
      new URL("segment.ts", result.url).href,
      "https://edge.cloud.cdn.example.org/a/segment.ts",
    );
    for (const value of ["foreign", "lan", "loop"]) {
      mode = value;
      await assert.rejects(
        fetchDownloadAsset("https://cloud.cdn.example.org/start", {}, roots),
      );
    }
    mode = "ok";
    hits = [];
    await assert.rejects(
      fetchDownloadAsset("https://cloud.cdn.example.org/start", {}, roots, async () => [
        "10.1.2.3",
      ]),
    );
    assert.equal(hits.length, 1, "the private destination is never requested");
  } finally {
    globalThis.fetch = saved;
  }
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fd00::1",
  ])
    assert.equal(publicDownloadAddress(ip), false, ip);
  for (const ip of ["93.184.216.34", "2606:4700:4700::1111"])
    assert.equal(publicDownloadAddress(ip), true, ip);
});

test("watch sessions reject replays, overlapping tabs, future dates and more than elapsed time", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const input = { startedAt: "2026-11-01T11:59:00Z", seconds: 6000 };
  assert.equal(boundedWatchSession(input, null, now)?.seconds, 60);
  assert.equal(
    boundedWatchSession(input, new Date("2026-11-01T11:59:30Z"), now)?.seconds,
    30,
  );
  assert.equal(boundedWatchSession(input, now, now), null);
  assert.equal(
    boundedWatchSession({ ...input, startedAt: "2026-11-02T00:00:00Z" }, null, now),
    null,
  );
  assert.equal(boundedWatchSession({ ...input, startedAt: "wrong" }, null, now), null);
});
