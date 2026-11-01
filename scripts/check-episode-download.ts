/** Real episode QA without writing accounts or impersonating a user. Loopback only. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { registerAnimeDownloads } from "../apps/api/src/routes/anime-download.ts";

const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const Fastify = requireApi("fastify");
const upstream = new URL(process.env.QA_API_ORIGIN ?? "http://127.0.0.1:4000");
assert(
  ["localhost", "127.0.0.1"].includes(upstream.hostname),
  "QA only calls a loopback API",
);
const animeId = Number(process.env.QA_ANIME_ID ?? "59193");
assert(Number.isSafeInteger(animeId) && animeId > 0);
const sourceId = process.env.QA_SOURCE_ID ?? "kodik:923";
const episode = Number(process.env.QA_EPISODE ?? "1");
const api = async (path: string) => {
  const response = await fetch(new URL(`/api${path}`, upstream), {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`QA upstream ${response.status}`);
  return response;
};
const watch = {
  getSources: async () => (await api(`/anime/${animeId}/watch`)).json(),
  getKodikStreams: async (_id: number, translation: string, ep: number) => {
    const text = await (
      await api(`/anime/${animeId}/streams/kodik/${translation}/${ep}/master.m3u8`)
    ).text();
    const variants: Record<string, string> = {};
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i++) {
      const height = /RESOLUTION=\d+x(\d+)/.exec(lines[i]!);
      if (height) variants[height[1]!] = lines[i + 1]!;
    }
    return { variants };
  },
  getAllohaMaster: async (_id: number, translation: string, ep: number) =>
    (
      await api(`/anime/${animeId}/streams/alloha/${translation}/${ep}/master.m3u8`)
    ).text(),
};
const app = Fastify({ logger: { level: "warn" } });
app.decorate("prisma", {
  user: {
    findUnique: async () => ({
      proSince: new Date(),
      proUntil: null,
      trialUntil: null,
      isBanned: false,
    }),
  },
  anime: { findFirst: async () => ({ title: "Episode QA", titleLocalized: null }) },
});
app.decorate("authenticate", async (req: { userId?: string }) => {
  req.userId = "isolated-qa-only";
});
await app.register(
  async (routes: Parameters<typeof registerAnimeDownloads>[0]) => {
    await registerAnimeDownloads(routes, watch as never);
    routes.get(
      "/anime/:id/streams/alloha/session/:session/:asset",
      async (req, reply) => {
        const p = req.params as { id: string; session: string; asset: string };
        assert.equal(Number(p.id), animeId);
        assert.match(p.session, /^[a-f0-9-]{36}$/);
        assert.match(p.asset, /^[a-f0-9]{24}$/);
        const response = await api(
          `/anime/${animeId}/streams/alloha/session/${p.session}/${p.asset}`,
        );
        reply
          .code(response.status)
          .type(response.headers.get("content-type") ?? "application/octet-stream");
        return reply.send(Readable.fromWeb(response.body as never));
      },
    );
  },
  { prefix: "/api" },
);
try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const issued = await app.inject({
    method: "POST",
    url: `/api/anime/${animeId}/download`,
    payload: { sourceId, episode, height: 360 },
  });
  assert.equal(issued.statusCode, 200, issued.body);
  const ticket = issued.json();
  const started = Date.now();
  let lastReport = 0;
  while (true) {
    const progress = (await app.inject(ticket.statusUrl)).json();
    assert.notEqual(progress.state, "failed", progress.message);
    if (Date.now() - lastReport > 30_000 || progress.state === "ready") {
      console.log(
        JSON.stringify({
          animeId,
          sourceId,
          state: progress.state,
          bytes: progress.bytes,
          seconds: Math.round((Date.now() - started) / 1000),
        }),
      );
      lastReport = Date.now();
    }
    if (progress.state === "ready") break;
    assert(Date.now() - started < 21 * 60_000, "QA timeout");
    await delay(2000);
  }
  const file = await fetch(origin + ticket.url);
  assert.equal(file.status, 200);
  const hash = createHash("sha256");
  let total = 0,
    prefix = Buffer.alloc(0);
  for await (const value of file.body!) {
    const chunk = Buffer.from(value);
    if (prefix.length < 8) prefix = Buffer.concat([prefix, chunk]).subarray(0, 8);
    total += chunk.length;
    hash.update(chunk);
  }
  assert.equal(prefix.toString("ascii", 4, 8), "ftyp");
  assert.equal(total, Number(file.headers.get("content-length")));
  assert(total > 1_000_000, "a complete real episode is expected");
  const resume = await fetch(origin + ticket.url, {
    headers: { Range: "bytes=1024-2047" },
  });
  assert.equal(resume.status, 206);
  assert.equal((await resume.arrayBuffer()).byteLength, 1024);
  console.log(
    JSON.stringify({
      animeId,
      sourceId,
      complete: true,
      bytes: total,
      sha256: hash.digest("hex"),
      resume: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      animeId,
      sourceId,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
