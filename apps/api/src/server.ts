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
  setTimeout(() => {
    void app.services.watch
      .warm(env.WATCH_WARM_LIMIT)
      .catch((error) => app.log.warn({ err: error }, "watch warm failed"));
  }, 4_000);
} catch (error) {
  app.log.error({ err: error }, "failed to start server");
  process.exit(1);
}
