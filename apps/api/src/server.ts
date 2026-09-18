import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";

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
    try {
      await app.services.watch.warm(env.WATCH_WARM_LIMIT);
    } catch (error) {
      app.log.warn({ err: error }, "watch warm failed");
    } finally {
      warming = false;
    }
  };

  setTimeout(() => void runWarm(), 4_000);
  if (env.WATCH_WARM_INTERVAL_MS > 0) {
    // unref'd so a pending tick never keeps the process alive during shutdown.
    setInterval(() => void runWarm(), env.WATCH_WARM_INTERVAL_MS).unref();
  }
} catch (error) {
  app.log.error({ err: error }, "failed to start server");
  process.exit(1);
}
