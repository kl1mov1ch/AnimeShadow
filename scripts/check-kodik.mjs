import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { VideoLinks } = require("kodikwrapper");
const titleId = Number(process.argv[2] ?? 1);
const fetcher = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
const watch = await fetcher(`http://localhost:4000/api/anime/${titleId}/watch`).then(
  (response) => response.json(),
);
const source = watch.sources?.find((item) => item.id.startsWith("kodik:"));
if (!source) throw new Error("No Kodik source in this title");
if (source.format === "hls") {
  if (watch.sources.some((item) => item.format !== "hls"))
    throw new Error("An iframe source escaped the custom-only API");
  for (const episode of Object.keys(source.hlsEpisodes).slice(0, 2)) {
    const response = await fetcher(
      new URL(source.hlsEpisodes[episode], "http://localhost:4000"),
    );
    const manifest = await response.text();
    if (!response.ok || !manifest.startsWith("#EXTM3U"))
      throw new Error(
        `Episode ${episode}: no master playlist (HTTP ${response.status})`,
      );
    const variants = manifest
      .split(/\r?\n/)
      .filter((line) => line.startsWith("https://"));
    const media = await fetcher(variants[0], {
      headers: { Origin: "http://localhost:5173" },
    });
    const playlist = await media.text();
    if (!media.ok || !playlist.startsWith("#EXTM3U"))
      throw new Error(`Episode ${episode}: media playlist unavailable`);
    const segment = playlist
      .split(/\r?\n/)
      .find((line) => line && !line.startsWith("#"));
    const segmentResponse = segment
      ? await fetcher(new URL(segment, media.url), {
          headers: { Range: "bytes=0-1023" },
        })
      : null;
    void segmentResponse?.body?.cancel();
    console.log(
      JSON.stringify({
        titleId,
        source: source.id,
        episode,
        master: response.status,
        qualities: variants.length,
        media: media.status,
        segment: segmentResponse?.status,
        cors: media.headers.get("access-control-allow-origin"),
        iframeSources: 0,
      }),
    );
  }
  process.exit(0);
}
const link = source.iframeEpisodes?.["1"]?.url ?? source.embedUrl;
try {
  const parsed = await VideoLinks.parseLink({ link, extended: true, fetcher });
  const endpoint = parsed.ex.playerSingleUrl
    ? await VideoLinks.getActualVideoInfoEndpoint(
        new URL(parsed.ex.playerSingleUrl, link).href,
        fetcher,
      )
    : undefined;
  const links = await VideoLinks.getLinks({
    link,
    videoInfoEndpoint: endpoint,
    fetcher,
  });
  const variant = Object.values(links).flat()[0];
  const response = variant
    ? await fetcher(new URL(variant.src, link), {
        headers: { Origin: "http://localhost:5173" },
      })
    : null;
  console.log(
    JSON.stringify({
      titleId,
      source: source.id,
      qualities: Object.keys(links),
      status: response?.status,
      cors: response?.headers.get("access-control-allow-origin"),
      type: response?.headers.get("content-type"),
      isManifest: response ? (await response.text()).startsWith("#EXTM3U") : false,
    }),
  );
} catch (error) {
  // Do not print signed media URLs or provider response payloads.
  console.error(
    JSON.stringify({
      titleId,
      name: error.name,
      code: error.code,
      reason: error.description ?? error.message,
    }),
  );
  process.exitCode = 1;
}
