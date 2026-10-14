import { createHash } from "node:crypto";
import sharp from "sharp";
import { watermark } from "../lib/watermark.js";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";

// Shikimori (and a few others) block hot-linking by Referer, so their images
// are fetched here, server-side, and handed to the browser from our origin.
const ALLOWED_HOSTS = [
  "shikimori.io",
  "shikimori.one",
  "shikimori.org",
  "shikimori.me",
  "nyaa.shikimori.one",
  "desu.shikimori.one",
  "moe.shikimori.one",
  "st.kp.yandex.net",
  "avatars.mds.yandex.net",
  "kinopoiskapiunofficial.tech",
  "cdn.myanimelist.net",
  "nekos.best",
  // Fast enough elsewhere, slow or patchy from Russia: kept here as well.
  "s4.anilist.co",
  "img.anili.st",
  "media.kitsu.app",
  "media.kitsu.io",
];

/** Upstream fetches at once. A page of posters used to fire them all together,
 *  and Shikimori answered a burst like that by refusing most of it. */
const MAX_UPSTREAM = 10;
/** A picture bigger than this is not a poster; it is not kept. */
const MAX_BYTES = 8 * 1024 * 1024;
/** How long "the source has no such picture" is believed before asking again. */
const MISSING_TTL_MS = 60 * 60_000;

const CACHE_DIR = env.IMAGE_CACHE_DIR ?? join(process.cwd(), "cache", "img");

// nekos.best's Cloudflare rules block generic/default library user-agents
// outright and require "APP_NAME (CONTACT_INFO)" — everything else here is
// fine with a plain identifying string.
function userAgentFor(hostname: string): string {
  return hostname === "nekos.best" || hostname.endsWith(".nekos.best")
    ? "AnimeShadow (https://animeshadow.online)"
    : "AnimeShadow/1.0 (image proxy)";
}

/** The picture's type from its first bytes — the cache keeps bytes only. */
function sniff(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.subarray(4, 12).toString("ascii").includes("ftypavif")) return "image/avif";
  return "image/jpeg";
}

type Fetched = { ok: true; buf: Buffer } | { ok: false; status: number };

/** A small counting semaphore for the upstream fetches. */
function limiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps the cache under its size limit, oldest pictures out first. Run at
 * start and every few hours; a full listing of a few thousand files is cheap.
 */
async function sweep(log: FastifyBaseLogger): Promise<void> {
  const limit = env.IMAGE_CACHE_MAX_MB * 1024 * 1024;
  try {
    const names = await readdir(CACHE_DIR);
    const files = await Promise.all(
      names
        .filter((name) => !name.endsWith(".tmp"))
        .map(async (name) => {
          const info = await stat(join(CACHE_DIR, name)).catch(() => null);
          return info ? { name, size: info.size, at: info.mtimeMs } : null;
        }),
    );
    const list = files.filter((f): f is NonNullable<typeof f> => f != null).sort((a, b) => a.at - b.at);
    let total = list.reduce((sum, f) => sum + f.size, 0);
    let removed = 0;
    for (const file of list) {
      if (total <= limit * 0.9) break;
      await unlink(join(CACHE_DIR, file.name)).catch(() => undefined);
      total -= file.size;
      removed += 1;
    }
    if (removed > 0) log.info({ removed, mb: Math.round(total / 1024 / 1024) }, "image cache trimmed");
  } catch {
    // No cache yet — nothing to trim.
  }
}

/**
 * The image proxy.
 *
 * Every picture is fetched from its source once and then kept on disk: the
 * next visitor — and every page after — gets it straight from here. Before,
 * each request went to the source again, and a grid of posters meant dozens
 * of simultaneous fetches; the source throttled the burst and the posters
 * stayed empty. Now at most six fetches run at a time, the same picture is
 * never fetched twice at once, a refusal is retried once, and a picture the
 * source doesn't have is remembered as missing for an hour.
 */
/** Only pictures from the hosts we use, over https — checked for the
 *  address asked for and again for every redirect on the way. */
function allowed(target: URL): boolean {
  return (
    target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    (target.port === "" || target.port === "443") &&
    ALLOWED_HOSTS.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`))
  );
}

/** Redirects followed by hand, each hop checked: "follow" would have gone
 *  wherever an open redirect on an allowed host pointed — this server's
 *  own loopback services included. */
const MAX_REDIRECTS = 3;

/** Reads a body up to `limit` bytes and gives up past it, instead of
 *  buffering whatever size the source sends and checking afterwards. */
async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches from the sources (cache misses) per visitor per minute. Anything
 * cached is free; this caps what one address can make the server download
 * and store — a `?x=1`, `?x=2`… loop on an allowed host would otherwise
 * fill the disk and get this server's address banned by the source.
 */
const MISSES_PER_MINUTE = 150;

export const imageRoutes: FastifyPluginAsync = async (fastify) => {
  const misses = new Map<string, { count: number; since: number }>();
  const overMissBudget = (ip: string): boolean => {
    const now = Date.now();
    const entry = misses.get(ip);
    if (!entry || now - entry.since > 60_000) {
      if (misses.size > 20_000) misses.clear();
      misses.set(ip, { count: 1, since: now });
      return false;
    }
    entry.count += 1;
    return entry.count > MISSES_PER_MINUTE;
  };
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  const upstream = limiter(MAX_UPSTREAM);
  // Decorative gifs (nekos.best) are big and their host can be slow: they
  // get a lane of their own, so a stalled gif never holds up a poster.
  const gifLane = limiter(3);
  const inflight = new Map<string, Promise<Fetched>>();
  const missing = new Map<string, number>();

  void sweep(fastify.log);
  const timer = setInterval(() => void sweep(fastify.log), 6 * 60 * 60_000);
  timer.unref();
  fastify.addHook("onClose", async () => clearInterval(timer));

  /** Old poster address → the one that replaced it, for this process. */
  const replaced = new Map<string, string>();

  /**
   * Finds the title whose poster this was and tries its other pictures:
   * the second poster field, then Shikimori's (ids match MyAnimeList's).
   * The first that loads is served and saved over the dead one.
   */
  const heal = async (dead: string): Promise<Buffer | null> => {
    const known = replaced.get(dead);
    const anime = known
      ? null
      : await fastify.prisma.anime
          .findFirst({
            where: { OR: [{ imageUrl: dead }, { imageLargeUrl: dead }] },
            select: { id: true, imageUrl: true, imageLargeUrl: true },
          })
          .catch(() => null);
    if (!known && !anime) return null;
    const candidates = known
      ? [known]
      : [
          anime!.imageUrl !== dead ? anime!.imageUrl : anime!.imageLargeUrl,
          `https://shikimori.io/system/animes/original/${anime!.id}.jpg`,
          `https://shikimori.io/system/animes/preview/${anime!.id}.jpg`,
        ].filter((u): u is string => !!u && u !== dead);
    for (const candidate of candidates) {
      let url: URL;
      try {
        url = new URL(candidate);
      } catch {
        continue;
      }
      if (!allowed(url)) continue;
      const key = createHash("sha1").update(url.toString()).digest("hex");
      const cached = await readFile(join(CACHE_DIR, key)).catch(() => null);
      const got: Fetched = cached && cached.length > 0 ? { ok: true, buf: cached } : await fetchOnce(url, key);
      if (!got.ok) continue;
      if (anime) {
        if (replaced.size > 5000) replaced.clear();
        replaced.set(dead, candidate);
        const data = {
          ...(anime.imageUrl === dead ? { imageUrl: candidate } : {}),
          ...(anime.imageLargeUrl === dead ? { imageLargeUrl: candidate } : {}),
        };
        await fastify.prisma.anime.update({ where: { id: anime.id }, data }).catch(() => undefined);
        fastify.log.info({ animeId: anime.id, dead, candidate }, "replaced a dead poster");
      }
      return got.buf;
    }
    return null;
  };

  const fetchOnce = (target: URL, key: string): Promise<Fetched> =>
    (target.hostname.endsWith("nekos.best") ? gifLane : upstream)(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          let url = target;
          let response = await fetch(url, {
            redirect: "manual",
            headers: { "user-agent": userAgentFor(url.hostname), accept: "image/*" },
            signal: AbortSignal.timeout(10_000),
          });
          for (let hop = 0; response.status >= 300 && response.status < 400; hop++) {
            const location = response.headers.get("location");
            await response.body?.cancel().catch(() => undefined);
            const next = location ? new URL(location, url) : null;
            if (!next || hop >= MAX_REDIRECTS || !allowed(next)) return { ok: false, status: 502 };
            url = next;
            response = await fetch(url, {
              redirect: "manual",
              headers: { "user-agent": userAgentFor(url.hostname), accept: "image/*" },
              signal: AbortSignal.timeout(10_000),
            });
          }
          if (response.ok) {
            const buf = await readCapped(response, MAX_BYTES);
            if (!buf || buf.length === 0) return { ok: false, status: 502 };
            const file = join(CACHE_DIR, key);
            await writeFile(`${file}.tmp`, buf)
              .then(() => rename(`${file}.tmp`, file))
              .catch(() => undefined);
            return { ok: true, buf };
          }
          if (response.status === 404 || response.status === 410) return { ok: false, status: 404 };
          if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
            await sleep(700);
            continue;
          }
          return { ok: false, status: 502 };
        } catch {
          if (attempt === 0) {
            await sleep(400);
            continue;
          }
          return { ok: false, status: 502 };
        }
      }
      return { ok: false, status: 502 };
    });

  /**
   * Once a day, slowly: every Kitsu poster in the catalogue is asked for
   * (HEAD, one at a time), and the ones Kitsu has lost are replaced the same
   * way as above — before any visitor meets an empty card. Kitsu is the
   * source whose links rot; the others keep theirs.
   */
  const checkKitsuPosters = async () => {
    let cursor = 0;
    let fixed = 0;
    for (;;) {
      const batch = await fastify.prisma.anime
        .findMany({
          where: { id: { gt: cursor }, imageUrl: { contains: "kitsu" } },
          orderBy: { id: "asc" },
          take: 100,
          select: { id: true, imageUrl: true },
        })
        .catch(() => []);
      if (batch.length === 0) break;
      for (const row of batch) {
        cursor = row.id;
        if (!row.imageUrl) continue;
        const status = await fetch(row.imageUrl, {
          method: "HEAD",
          headers: { "user-agent": userAgentFor("media.kitsu.app") },
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => r.status)
          .catch(() => 0);
        if (status === 404 || status === 410) {
          if (await heal(row.imageUrl)) fixed += 1;
        }
        await sleep(400);
      }
    }
    if (fixed > 0) fastify.log.info({ fixed }, "dead Kitsu posters replaced");
  };
  const firstCheck = setTimeout(() => void checkKitsuPosters(), 3 * 60_000);
  const dailyCheck = setInterval(() => void checkKitsuPosters(), 24 * 60 * 60_000);
  firstCheck.unref();
  dailyCheck.unref();
  fastify.addHook("onClose", async () => {
    clearTimeout(firstCheck);
    clearInterval(dailyCheck);
  });

  fastify.get("/img", async (request, reply) => {
    const raw = (request.query as { u?: string }).u;
    if (!raw) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Missing ?u" } };
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Bad url" } };
    }

    if (!allowed(target)) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "Host not allowed" } };
    }

    const key = createHash("sha1").update(target.toString()).digest("hex");
    // ?w=480: a smaller copy (WebP), for thumbnails; ?wm=1: the site's mark
    // burned in (see lib/watermark). Each made once and kept on disk beside
    // the original — a 350 KB frame shown at 240 px wide becomes ~20 KB.
    const q = request.query as { wm?: string; w?: string };
    const wm = q.wm === "1";
    const width = [240, 360, 480, 640, 960, 1280].find((n) => String(n) === q.w) ?? null;
    const derived = wm || width != null;
    const derivedFile = join(CACHE_DIR, `${key}${width ? `-w${width}` : ""}${wm ? "-wm" : ""}`);
    if (derived) {
      const done = await readFile(derivedFile).catch(() => null);
      if (done && done.length > 0) {
        return reply
          .header("content-type", sniff(done))
          .header("cache-control", "public, max-age=2592000, immutable")
          .header("cross-origin-resource-policy", "cross-origin")
          .header("x-cache", "HIT")
          .send(done);
      }
    }
    const send = async (raw: Buffer, hit: boolean) => {
      let buf = raw;
      if (derived) {
        try {
          let out = raw;
          if (wm) out = await watermark(out);
          if (width) {
            out = await sharp(out, { failOn: "none" })
              .resize({ width, withoutEnlargement: true })
              .webp({ quality: 72 })
              .toBuffer();
          }
          buf = out;
          await writeFile(derivedFile, buf).catch(() => undefined);
        } catch {
          buf = raw;
        }
      }
      return reply
        .header("content-type", sniff(buf))
        .header("cache-control", "public, max-age=2592000, immutable")
        .header("cross-origin-resource-policy", "cross-origin")
        // Lets the web app read pixels off these (canvas colour extraction).
        .header("access-control-allow-origin", "*")
        .header("x-cache", hit ? "HIT" : "MISS")
        .send(buf);
    };

    const cached = await readFile(join(CACHE_DIR, key)).catch(() => null);
    if (cached && cached.length > 0) return send(cached, true);

    const knownMissing = missing.get(key);
    if (knownMissing && Date.now() - knownMissing < MISSING_TTL_MS) {
      const healed = replaced.has(target.toString()) ? await heal(target.toString()) : null;
      if (healed) return send(healed, true);
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Image not found" } };
    }

    let pending = inflight.get(key);
    if (!pending && overMissBudget(request.ip)) {
      reply.code(429).header("retry-after", "60").header("cache-control", "no-store");
      return { error: { code: "RATE_LIMITED", message: "Too many new images, slow down" } };
    }
    if (!pending) {
      pending = fetchOnce(target, key).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const result = await pending;
    if (result.ok) return send(result.buf, false);

    // A title's poster the source has lost (Kitsu re-hashes its files, for
    // one): serve another picture of the same title right away, and put it
    // in the catalogue so lists ask for the working one from now on.
    if (result.status === 404) {
      const healed = await heal(target.toString());
      if (healed) {
        // Kept under the old address too: after a restart it is a plain hit.
        await writeFile(join(CACHE_DIR, key), healed).catch(() => undefined);
        return send(healed, false);
      }
    }

    if (result.status === 404) {
      if (missing.size > 5000) missing.clear();
      missing.set(key, Date.now());
    }
    reply.code(result.status).header("cache-control", "no-store");
    return { error: { code: result.status === 404 ? "NOT_FOUND" : "UPSTREAM_UNAVAILABLE", message: "Image fetch failed" } };
  });
};
