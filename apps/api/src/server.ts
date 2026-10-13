import closeWithGrace from "close-with-grace";
import { inBackground } from "./lib/priority.js";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startIndexNow } from "./seo/indexnow.js";

const app = await buildApp();

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({ err }, "shutting down after fatal error");
  } else {
    app.log.info({ signal }, "shutting down gracefully");
  }
  await app.close();
});

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(
    `AnimeShadow API ready on http://${env.API_HOST}:${env.API_PORT}/api`,
  );

  // Non-blocking: fill in which cached titles have a player.
  //
  // Repeated, not once per boot. One `warm` pass only ever covers
  // WATCH_WARM_LIMIT titles — the next ones that have never been resolved or
  // whose verdict has gone stale, most-popular first. Running it a single
  // time meant player coverage (and with it the "custom player" filter, which
  // reads the same WatchAvailability rows) froze at whatever that one pass
  // reached, and grew afterwards only when somebody happened to open a
  // title's page. Each tick resumes where the last stopped, because the query
  // selects what is still missing rather than a fixed slice.
  let warming = false;
  const runWarm = async () => {
    // A pass can easily outlast the interval — it resolves titles one at a
    // time against three upstream providers. Stacking passes would hammer
    // them and re-resolve the same rows concurrently.
    if (warming) return;
    warming = true;
    // First, and quick (five listings): the catalogue's first pages, so the
    // first visitors after a deploy don't each wait on Shikimori for them.
    await app.services.catalog.prewarmBrowse().catch((error: unknown) =>
      app.log.warn({ err: error }, "catalogue prewarm failed"),
    );
    // And the home page's rails, the one page everyone opens — with the
    // slider's pictures put in the image cache, so the first visitor after
    // a deploy doesn't wait on a CDN for them.
    const home = await app.services.catalog.getDiscover().catch((error: unknown) => {
      app.log.warn({ err: error }, "home page prewarm failed");
      return null;
    });
    for (const slide of home?.spotlights ?? []) {
      const art =
        slide.bannerImage ??
        (slide.imageLargeUrl ?? slide.imageUrl)?.replace("/media/anime/cover/medium/", "/media/anime/cover/large/");
      if (art) await app.inject({ method: "GET", url: `/api/img?u=${encodeURIComponent(art)}` }).catch(() => undefined);
    }
    try {
      await app.services.watch.warm(env.WATCH_WARM_LIMIT);
    } catch (error) {
      app.log.warn({ err: error }, "watch warm failed");
    }
    try {
      // Same pass, separate concern: fills in each title's banner, cover and
      // accent colour. Without it the accent only ever arrived one
      // detail-page visit at a time, so a catalogue of thousands had it on a
      // few dozen rows and the tinting looked broken rather than pending.
      await app.services.catalog.warmArtwork(env.ARTWORK_WARM_LIMIT);
    } catch (error) {
      app.log.warn({ err: error }, "artwork warm failed");
    }
    try {
      // Synopses and real ratings for titles that came in from Kodik.
      await app.services.catalog.warmDetails(env.DETAIL_WARM_LIMIT);
    } catch (error) {
      app.log.warn({ err: error }, "detail warm failed");
    } finally {
      warming = false;
    }
  };

  // Upkeep, all of it: its upstream calls wait behind visitors' requests.
  setTimeout(() => void inBackground(runWarm), 4_000);
  // Tell Yandex and Bing about new and changed pages (only with INDEXNOW_KEY).
  startIndexNow(app.prisma, app.log);

  // Every anime Kodik can play, into the catalogue: two minutes after start
  // (well after the deploy's trial run on the spare port has been stopped),
  // then every six hours. Weekly passes are full, the rest read only the
  // most recently updated rows.
  if (env.KODIK_CATALOG_SYNC) {
    setTimeout(() => void app.services.kodikSync.runScheduled(), 120_000).unref();
    setInterval(() => void app.services.kodikSync.runScheduled(), 6 * 60 * 60_000).unref();
  }
  // AniLibria's catalogue, matched to ours: three minutes after start, then
  // checked every six hours (a full read runs at most once a day).
  if (env.ANILIBRIA_CATALOG_SYNC) {
    setTimeout(() => void inBackground(() => app.services.anilibriaSync.runScheduled()), 180_000).unref();
    setInterval(() => void inBackground(() => app.services.anilibriaSync.runScheduled()), 6 * 60 * 60_000).unref();
  }
  // The hero no longer plays clips (it shows episode frames), so they are
  // no longer cut: no ffmpeg runs in the background. HeroClipService stays
  // for when clips come back — its refresh would be scheduled here.
  // Every other name of each title (synonyms, abbreviations) for search:
  // four minutes after start, then every six hours; each pass reads the
  // titles not read yet, best-known first (see TitleNamesService).
  setTimeout(() => void inBackground(() => app.services.titleNames.run()), 4 * 60_000).unref();
  setInterval(() => void inBackground(() => app.services.titleNames.run()), 6 * 60 * 60_000).unref();
  // Statistics upkeep: finished days rolled up, raw rows past their time
  // pruned. Five minutes after start, then every six hours (see
  // StatsRollupService).
  setTimeout(() => void inBackground(() => app.services.statsRollup.run()), 5 * 60_000).unref();
  setInterval(() => void inBackground(() => app.services.statsRollup.run()), 6 * 60 * 60_000).unref();
  if (env.WATCH_WARM_INTERVAL_MS > 0) {
    // unref'd so a pending tick never keeps the process alive during shutdown.
    setInterval(() => void inBackground(runWarm), env.WATCH_WARM_INTERVAL_MS).unref();
  }
} catch (error) {
  app.log.error({ err: error }, "failed to start server");
  process.exit(1);
}
