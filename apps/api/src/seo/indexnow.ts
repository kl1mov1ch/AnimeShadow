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
 * pages and every title touched in the last two days (with its newest
 * episode's page); then every three hours, whatever changed since.
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
        select: { id: true, slug: true, type: true },
        take: 40_000,
      });
      // A running show's newest episode has its own page — and that page is
      // what people look for on the day it comes out.
      const series = anime.filter((a) => a.type !== "MOVIE");
      const latest = series.length
        ? await prisma.playerSource.groupBy({
            by: ["animeId"],
            where: { animeId: { in: series.map((a) => a.id) }, kind: { not: "subtitles" }, episodesCount: { gt: 0 } },
            _max: { episodesCount: true },
          })
        : [];
      const newest = new Map(latest.map((row) => [row.animeId, row._max.episodesCount ?? 0]));
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
        "/schedule",
        "/studios",
        ...anime.map((a) => `/anime/${a.slug}`),
        ...series.flatMap((a) => {
          const n = Math.min(3000, newest.get(a.id) ?? 0);
          return n > 0 ? [`/anime/${a.slug}/episode/${n}`] : [];
        }),
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
  // Every three hours: a new episode is searched for most in its first day.
  setInterval(() => void run(), 3 * 60 * 60_000).unref();
}
