import type { PrismaClient } from "@animeshadow/db";
import { landingPath, seasonOf, shiftSeason } from "@animeshadow/shared";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { SITE } from "./html.js";

const ENDPOINTS = ["https://yandex.com/indexnow", "https://api.indexnow.org/indexnow"];
/** IndexNow takes at most 10 000 URLs a request. */
const BATCH = 10_000;

/**
 * IndexNow: tells Yandex (and Bing, Seznam, Naver…) which pages are new or
 * changed, instead of waiting for them to come and look. Off until
 * INDEXNOW_KEY is set. The first run, a minute after start, sends the main
 * pages and every title touched in the last two days; then once a day,
 * whatever changed since.
 */
export function startIndexNow(prisma: PrismaClient, log: FastifyBaseLogger): void {
  const key = env.INDEXNOW_KEY;
  if (!key || !/^https:\/\//.test(SITE)) return;
  const host = new URL(SITE).host;
  let since = new Date(Date.now() - 2 * 86_400_000);

  const run = async () => {
    const startedAt = new Date();
    try {
      const anime = await prisma.anime.findMany({
        where: { AND: [{ updatedAt: { gte: since } }, contentGuardWhere(true)] },
        orderBy: { members: { sort: "desc", nulls: "last" } },
        select: { slug: true },
        take: 40_000,
      });
      const now = seasonOf(new Date());
      const urls = [
        "/",
        "/browse",
        "/ongoing",
        "/top",
        "/popular",
        "/movies",
        "/announced",
        landingPath({ kind: "season", ...now }),
        landingPath({ kind: "season", ...shiftSeason(now, 1) }),
        landingPath({ kind: "year", year: now.year }),
        ...anime.map((a) => `/anime/${a.slug}`),
      ].map((p) => `${SITE}${p}`);
      let sent = 0;
      for (let i = 0; i < urls.length; i += BATCH) {
        const urlList = urls.slice(i, i + BATCH);
        const body = JSON.stringify({ host, key, keyLocation: `${SITE}/indexnow-${key}.txt`, urlList });
        const results = await Promise.allSettled(
          ENDPOINTS.map((endpoint) =>
            fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json; charset=utf-8" },
              body,
              signal: AbortSignal.timeout(20_000),
            }),
          ),
        );
        const statuses = results.map((r) => (r.status === "fulfilled" ? r.value.status : "error"));
        log.info({ urls: urlList.length, statuses }, "indexnow batch sent");
        sent += urlList.length;
      }
      since = startedAt;
      log.info({ sent }, "indexnow done");
    } catch (error) {
      log.warn({ err: error }, "indexnow failed");
    }
  };

  setTimeout(() => void run(), 60_000).unref();
  setInterval(() => void run(), 24 * 60 * 60_000).unref();
}
