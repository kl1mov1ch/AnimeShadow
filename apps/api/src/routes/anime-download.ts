import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createReadStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import {
  prepareDownloadFile,
  downloadRange,
  type DownloadFile,
} from "../lib/download-file.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WatchService } from "../services/watch.service.js";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import {
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UpstreamUnavailableError,
} from "../lib/errors.js";
import { safeExternalUrl } from "../lib/external-player.js";
import { fetchDownloadAsset } from "../lib/download-redirects.js";
import { proActive } from "../lib/pro.js";
import { parse } from "../lib/validation.js";

const token = () => randomBytes(24).toString("hex");
const params = z.object({ id: z.coerce.number().int().positive() });
const input = z.object({
  sourceId: z.string().min(1).max(150),
  episode: z.number().int().min(1).max(10000),
  height: z.number().int().min(144).max(2160).optional(),
});
type Selection = z.infer<typeof input>;
type Ticket = Selection & {
  animeId: number;
  userId: string;
  expires: number;
  filename: string;
  file?: DownloadFile;
  preparing?: Promise<void>;
  error?: string;
  bytes?: number;
  downloaded?: boolean;
};
type Job = {
  animeId: number;
  userId: string;
  assets: Map<string, string>;
  manifests: Map<string, string>;
  roots: Set<string>;
  directFiles: Set<string>;
  localOrigin: string;
  active: boolean;
  height?: number;
  failed?: boolean;
  signal: AbortSignal;
  cancel: () => void;
  ahead: Map<string, string[]>;
  prefetched: Map<string, Promise<{ response: Response; url: string } | undefined>>;
};

function assetExtension(url: string) {
  return (
    /\.(m3u8|mp4|key|aac)$/i.exec(new URL(url).pathname)?.[0].toLowerCase() ?? ".ts"
  );
}

export function downloadFilename(title: string, episode: number) {
  return `${
    title
      .split("")
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join("")
      .replace(/[<>:"/\\|?*]/g, "")
      .trim()
      .slice(0, 100) || "Anime"
  } — серия ${episode}.mp4`;
}

/** All URLs come from a stored source. A manifest cannot introduce another host or protocol. */
export function downloadAssetUrl(
  uri: string,
  base: string,
  roots: Set<string>,
  localOrigin: string,
  animeId: number,
) {
  const url = new URL(uri, base);
  if (
    url.origin === localOrigin &&
    new RegExp(
      `^/api/anime/${animeId}/streams/alloha/session/[a-f0-9-]+/[a-f0-9]{24}$`,
    ).test(url.pathname) &&
    !url.search
  )
    return url.href;
  if (!safeExternalUrl(url.href) || !roots.has(url.origin))
    throw new Error("Untrusted download asset");
  return url.href;
}

export function selectDownloadPlaylist(text: string, height?: number) {
  const lines = text.split(/\r?\n/);
  const variants = lines
    .flatMap((line, i) => {
      if (!line.startsWith("#EXT-X-STREAM-INF:")) return [];
      return [
        {
          index: i,
          height: Number(line.match(/RESOLUTION=\d+x(\d+)/)?.[1] ?? 0),
          bandwidth: Number(line.match(/BANDWIDTH=(\d+)/)?.[1] ?? 0),
        },
      ];
    })
    .sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth);
  if (!variants.length) return text;
  const selected =
    (height ? variants.filter((v) => v.height <= height).at(-1) : variants.at(-1)) ??
    variants[0]!;
  const remove = new Set(
    variants
      .filter((v) => v.index !== selected.index)
      .flatMap((v) => [v.index, v.index + 1]),
  );
  return lines.filter((_, i) => !remove.has(i)).join("\n");
}

export function rewriteDownloadManifest(
  text: string,
  base: string,
  rewrite: (uri: string, base: string) => string,
) {
  if (!text.trimStart().startsWith("#EXTM3U"))
    throw new Error("Invalid download manifest");
  return text
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith("#")
        ? line.replace(
            /URI="([^"\r\n]+)"/g,
            (_, uri: string) => `URI="${rewrite(uri, base)}"`,
          )
        : line.trim()
          ? rewrite(line.trim(), base)
          : line,
    )
    .join("\n");
}

/** Choose a real available resolution, never a made-up upscale. */
export function downloadVariant(variants: Record<string, string>, height?: number) {
  const heights = Object.keys(variants)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const selected = height
    ? (heights.filter((n) => n <= height).at(-1) ?? heights[0])
    : heights.at(-1);
  const url = selected == null ? undefined : variants[String(selected)];
  if (!url || !safeExternalUrl(url))
    throw new UpstreamUnavailableError("Файл этой серии пока недоступен.");
  return url;
}

export async function registerAnimeDownloads(
  app: FastifyInstance,
  watch: WatchService,
) {
  const tickets = new Map<string, Ticket>();
  const jobs = new Map<string, Job>();
  const running = new Set<() => void>();
  app.addHook("preClose", async () => {
    clearInterval(expiryTimer);
    for (const stop of running) stop();
    await Promise.allSettled(
      [...tickets.values()].map(async (t) => {
        await t.preparing;
        await t.file?.remove();
      }),
    );
  });
  const paidUser = async (id: string) => {
    const user = await app.prisma.user.findUnique({
      where: { id },
      select: { proSince: true, proUntil: true, trialUntil: true, isBanned: true },
    });
    if (!user || user.isBanned || !proActive(user))
      throw new ForbiddenError("Скачивание доступно пользователям PRO.");
  };
  const sweep = () => {
    for (const [key, value] of tickets) {
      if (value.expires < Date.now() && !value.preparing) {
        if (value.file)
          void value.file
            .remove()
            .then(() => tickets.delete(key))
            .catch(() => {});
        else tickets.delete(key);
      }
    }
  };
  const expiryTimer = setInterval(sweep, 60_000);
  expiryTimer.unref();
  const warmAssets = (job: Job, keys: string[]) => {
    for (const key of keys) {
      if (job.prefetched.size >= 3 || job.prefetched.has(key)) continue;
      const url = job.assets.get(key);
      if (!url) continue;
      job.prefetched.set(
        key,
        (async () => {
          try {
            const result = await fetchDownloadAsset(
              url,
              { signal: AbortSignal.any([job.signal, AbortSignal.timeout(8000)]) },
              job.roots,
            );
            if (!result.response.ok || !result.response.body) {
              await result.response.body?.cancel();
              return;
            }
            const reader = result.response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 4 * 1024 * 1024) return; // large fragments stream normally
                chunks.push(value);
              }
            } finally {
              await reader.cancel();
            }
            const headers = new Headers(result.response.headers);
            headers.delete("content-encoding");
            headers.set("content-length", String(size));
            return {
              response: new Response(Buffer.concat(chunks), {
                status: result.response.status,
                headers,
              }),
              url: result.url,
            };
          } catch {
            /* On-demand fetching performs the normal bounded retries. */
          }
        })(),
      );
    }
  };
  app.post(
    "/anime/:id/download",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 6, timeWindow: "10 minutes" } },
    },
    async (req, reply) => {
      const { id } = parse(params, req.params);
      const selection = parse(input, req.body);
      await paidUser(req.userId!);
      const allowAdult = await resolveAllowAdult(app.prisma, req.userId, undefined);
      const anime = await app.prisma.anime.findFirst({
        where: { id, ...contentGuardWhere(allowAdult) },
        select: { title: true, titleLocalized: true },
      });
      if (!anime) throw new NotFoundError("Аниме не найдено.");
      const sources = await watch.getSources(id);
      const source = sources.sources.find((s) => s.id === selection.sourceId);
      if (
        !source ||
        !["hls", "mp4"].includes(source.format) ||
        !(source.hlsEpisodes ?? source.mediaEpisodes)?.[String(selection.episode)]
      )
        throw new NotFoundError(
          "Выбранная серия в этой озвучке недоступна для скачивания.",
        );
      sweep();
      const existing = [...tickets.entries()].find(
        ([, t]) =>
          t.userId === req.userId &&
          t.animeId === id &&
          t.sourceId === selection.sourceId &&
          t.episode === selection.episode &&
          t.height === selection.height &&
          !t.error &&
          !t.downloaded &&
          t.expires > Date.now(),
      );
      if (existing) {
        const [key, saved] = existing;
        return reply.header("cache-control", "private, no-store").send({
          url: `/api/anime/${id}/download/${key}`,
          statusUrl: `/api/anime/${id}/download/${key}/status`,
          filename: saved.filename,
        });
      }
      if (tickets.size >= 100)
        throw new TooManyRequestsError("Скачивание занято. Попробуйте чуть позже.");
      const key = token();
      const filename = downloadFilename(
        anime.titleLocalized ?? anime.title,
        selection.episode,
      );
      tickets.set(key, {
        ...selection,
        animeId: id,
        userId: req.userId!,
        filename,
        expires: Date.now() + 60_000,
      });
      return reply.header("cache-control", "private, no-store").send({
        url: `/api/anime/${id}/download/${key}`,
        statusUrl: `/api/anime/${id}/download/${key}/status`,
        filename,
      });
    },
  );

  // FFmpeg can read only these short-lived loopback URLs. It never receives a CDN URL.
  app.get(
    "/anime/:id/download-assets/:job/:asset",
    {
      config: {
        rateLimit: {
          max: 1200,
          timeWindow: "1 minute",
          allowList: (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip),
        },
      },
    },
    async (req, reply) => {
      const p = parse(
        params.extend({
          job: z.string().regex(/^[a-f0-9]{48}$/),
          asset: z.string().regex(/^[a-f0-9]{48}(?:\.(?:m3u8|ts|mp4|key|aac))?$/),
        }),
        req.params,
      );
      const job = jobs.get(p.job);
      const target = job?.assets.get(p.asset.split(".")[0]!);
      const inlineManifest = job?.manifests.get(p.asset.split(".")[0]!);
      if (!job?.active || job.animeId !== p.id || (!target && !inlineManifest))
        throw new NotFoundError();
      // The capability is for the local converter, not an alternate public video endpoint.
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip))
        throw new ForbiddenError();
      if (inlineManifest)
        return reply
          .type("application/vnd.apple.mpegurl")
          .header("cache-control", "no-store")
          .send(inlineManifest);
      const abort = new AbortController();
      const close = () => abort.abort(new Error("Converter closed fragment request"));
      reply.raw.once("close", close);
      const directFile = job.directFiles.has(target!);
      const timeout = setTimeout(
        () => abort.abort(new Error("Fragment request timeout")),
        directFile ? 2 * 60 * 60_000 : 90_000,
      );
      const clean = () => {
        clearTimeout(timeout);
        reply.raw.off("close", close);
      };
      try {
        const range = req.headers.range;
        if (range && !/^bytes=\d{1,12}-\d{0,12}$/.test(range)) {
          clean();
          return reply.code(416).send();
        }
        // FFmpeg probes with bytes=0-. The Alloha segment gateway accepts only
        // bounded ranges; a full-fragment probe must not become an immediate 416.
        const forwardedRange =
          target!.startsWith(job.localOrigin) && range === "bytes=0-"
            ? undefined
            : range;
        let response: Response | undefined;
        let resolvedUrl = target!;
        const assetKey = p.asset.split(".")[0]!;
        const prefetched = job.prefetched.get(assetKey);
        job.prefetched.delete(assetKey);
        warmAssets(job, job.ahead.get(assetKey) ?? []);
        const warm =
          prefetched && (!range || range === "bytes=0-") ? await prefetched : undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const fetched =
              attempt === 0 && warm
                ? warm
                : await fetchDownloadAsset(
                    target!,
                    {
                      headers: forwardedRange ? { range: forwardedRange } : {},
                      signal: directFile
                        ? abort.signal
                        : AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
                    },
                    job.roots,
                  );
            response = fetched.response;
            resolvedUrl = fetched.url;
            // Give FFmpeg complete fragments. A broken CDN response is retried before
            // any bytes reach the converter, so it cannot silently skip half a segment.
            if (
              response.ok &&
              response.body &&
              !directFile &&
              !(attempt === 0 && warm)
            ) {
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let bytes = 0;
              const limit =
                /mpegurl/i.test(response.headers.get("content-type") ?? "") ||
                new URL(resolvedUrl).pathname.endsWith(".m3u8")
                  ? 1_000_000
                  : 64 * 1024 * 1024;
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  bytes += value.length;
                  if (bytes > limit) throw new Error("Download fragment too large");
                  chunks.push(value);
                }
              } finally {
                await reader.cancel();
              }
              const headers = new Headers(response.headers);
              headers.delete("content-encoding");
              headers.set("content-length", String(bytes));
              response = new Response(Buffer.concat(chunks), {
                status: response.status,
                headers,
              });
            }
            if (
              response.ok ||
              (response.status < 500 && ![408, 429].includes(response.status))
            )
              break;
            await response.body?.cancel();
          } catch (error) {
            if (abort.signal.aborted || attempt === 2) throw error;
          }
          if (attempt < 2)
            await delay(250 * 2 ** attempt, undefined, { signal: abort.signal });
        }
        if (!response?.ok || !response.body)
          throw new Error(
            `Download CDN unavailable (${response?.status ?? "network"})`,
          );
        const type = response.headers.get("content-type") ?? "";
        if (/mpegurl/i.test(type) || new URL(resolvedUrl).pathname.endsWith(".m3u8")) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              length += value.length;
              if (length > 1_000_000) throw new Error("Playlist too large");
              chunks.push(value);
            }
          } finally {
            await reader.cancel();
          }
          const manifest = rewriteDownloadManifest(
            selectDownloadPlaylist(Buffer.concat(chunks).toString("utf8"), job.height),
            resolvedUrl,
            (uri, base) => {
              const url = downloadAssetUrl(
                uri,
                base,
                job.roots,
                job.localOrigin,
                job.animeId,
              );
              if (job.assets.size > 20000) throw new Error("Too many assets");
              const key = token();
              job.assets.set(key, url);
              return `${job.localOrigin}/api/anime/${p.id}/download-assets/${p.job}/${key}${assetExtension(url)}`;
            },
          );
          if (!manifest.includes("#EXT-X-STREAM-INF")) {
            const keys = [
              ...manifest.matchAll(/\/download-assets\/[a-f0-9]{48}\/([a-f0-9]{48})/g),
            ].map((m) => m[1]!);
            for (let i = 0; i < keys.length; i++)
              job.ahead.set(keys[i]!, keys.slice(i + 1, i + 4));
            warmAssets(job, keys.slice(0, 3));
          }
          clean();
          return reply
            .type("application/vnd.apple.mpegurl")
            .header("cache-control", "no-store")
            .send(manifest);
        }
        if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4))/.test(type))
          throw new Error("Invalid download media");
        let size = 0;
        const bounded = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            size += chunk.length;
            done(
              size > (directFile ? 8 * 1024 * 1024 * 1024 : 64 * 1024 * 1024)
                ? new Error("Segment too large")
                : null,
              chunk,
            );
          },
        });
        const stream = Readable.fromWeb(response.body as never);
        stream.on("error", (e) => {
          job.failed = true;
          bounded.destroy(e);
        });
        bounded.on("error", () => {
          job.failed = true;
        });
        bounded.once("close", () => {
          clean();
          abort.abort();
          stream.destroy();
        });
        reply.code(response.status).type(type).header("cache-control", "no-store");
        for (const h of ["content-length", "content-range", "accept-ranges"]) {
          const value = response.headers.get(h);
          if (value) reply.header(h, value);
        }
        return reply.send(stream.pipe(bounded));
      } catch (error) {
        job.failed = true;
        job.cancel();
        req.log.warn(
          {
            animeId: job.animeId,
            host: new URL(target!).hostname,
            reason: String(error).replace(/https?:\/\/[^\s]+/g, "[stream]"),
          },
          "Episode download fragment failed",
        );
        clean();
        abort.abort();
        throw new UpstreamUnavailableError("Не удалось получить фрагмент серии.");
      } finally {
        if (reply.sent) clean();
      }
    },
  );

  const ensurePrepared = (selection: Ticket) => {
    if (selection.preparing || selection.file || selection.error) return;
    if (jobs.size >= 2 || [...jobs.values()].some((j) => j.userId === selection.userId))
      throw new TooManyRequestsError(
        "Дождитесь подготовки текущего скачивания и повторите попытку.",
      );
    const address = app.server.address();
    if (!address || typeof address === "string") throw new UpstreamUnavailableError();
    const id = selection.animeId;
    const origin = "http://127.0.0.1:" + address.port;
    const jobKey = token();
    const abort = new AbortController();
    const job: Job = {
      animeId: id,
      userId: selection.userId,
      assets: new Map(),
      manifests: new Map(),
      roots: new Set(),
      directFiles: new Set(),
      localOrigin: origin,
      active: true,
      height: selection.height,
      signal: abort.signal,
      cancel: () => abort.abort(),
      ahead: new Map(),
      prefetched: new Map(),
    };
    const cleanup = () => {
      job.active = false;
      jobs.delete(jobKey);
      running.delete(cleanup);
      abort.abort();
    };
    jobs.set(jobKey, job);
    running.add(cleanup);
    selection.expires = Date.now() + 21 * 60_000;
    selection.preparing = (async () => {
      try {
        const sources = await watch.getSources(id);
        const source = sources.sources.find((s) => s.id === selection.sourceId);
        let media = (source?.hlsEpisodes ?? source?.mediaEpisodes)?.[
          String(selection.episode)
        ];
        if (!source || !media) throw new NotFoundError("Серия больше недоступна.");
        const [provider, ...parts] = source.id.split(":");
        if (provider === "kodik")
          media = downloadVariant(
            (await watch.getKodikStreams(id, parts.join(":"), selection.episode))
              .variants,
            selection.height,
          );
        else if (provider === "alloha") {
          const manifest = await watch.getAllohaMaster(
            id,
            parts.join(":"),
            selection.episode,
          );
          // Stored locally as a manifest so the same strict proxy handles all nested playlists.
          media = `${origin}/api/anime/${id}/streams/alloha/${parts.join(":")}/${selection.episode}/master.m3u8`;
          // The content guard above already permitted this account; use the verified manifest directly.
          const local = rewriteDownloadManifest(
            selectDownloadPlaylist(manifest, selection.height),
            media,
            (uri, base) => {
              const target = downloadAssetUrl(uri, base, job.roots, origin, id);
              const key = token();
              job.assets.set(key, target);
              return `${origin}/api/anime/${id}/download-assets/${jobKey}/${key}${assetExtension(target)}`;
            },
          );
          const manifestKey = token();
          job.manifests.set(manifestKey, local);
          media = `${origin}/api/anime/${id}/download-assets/${jobKey}/${manifestKey}.m3u8`;
        } else if (provider === "animevost")
          media = await watch.getAnimeVostStream(
            id,
            parts.join(":"),
            selection.episode,
          );
        if (source.format === "mp4") job.directFiles.add(media);
        if (!media.startsWith(`${origin}/api/anime/${id}/download-assets/${jobKey}/`)) {
          if (!safeExternalUrl(media))
            throw new UpstreamUnavailableError(
              "Скачивание этой серии пока недоступно.",
            );
          job.roots.add(new URL(media).origin);
          const key = token();
          job.assets.set(key, media);
          media = `${origin}/api/anime/${id}/download-assets/${jobKey}/${key}${assetExtension(media)}`;
        }
        if (!job.active) throw new Error("Download cancelled");
        const file = await prepareDownloadFile(
          media,
          source.format === "hls",
          abort.signal,
          (bytes) => {
            selection.bytes = bytes;
          },
        );
        if (job.failed) {
          await file.remove();
          throw new Error("An episode fragment could not be downloaded");
        }
        selection.file = file;
        selection.bytes = file.bytes;
        selection.expires = Date.now() + 30 * 60_000;
      } catch (error) {
        app.log.warn(
          {
            animeId: id,
            reason: String(error).replace(/https?:\/\/[^\s]+/g, "[stream]"),
          },
          "Episode download preparation failed",
        );
        selection.error =
          "Не удалось подготовить серию. Попробуйте другую озвучку или повторите позже.";
        selection.expires = Date.now() + 60_000;
      } finally {
        cleanup();
        selection.preparing = undefined;
      }
    })();
  };
  const readTicket = async (raw: unknown) => {
    const { id, ticket } = parse(
      params.extend({ ticket: z.string().regex(/^[a-f0-9]{48}$/) }),
      raw,
    );
    sweep();
    const selection = tickets.get(ticket);
    if (!selection || selection.animeId !== id || selection.expires < Date.now())
      throw new NotFoundError("Ссылка устарела. Нажмите «Скачать» ещё раз.");
    await paidUser(selection.userId);
    return { selection, id, ticket };
  };
  app.get(
    "/anime/:id/download/:ticket/status",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { selection } = await readTicket(req.params);
      ensurePrepared(selection);
      return reply.header("cache-control", "private, no-store").send({
        state: selection.error ? "failed" : selection.file ? "ready" : "preparing",
        bytes: selection.bytes ?? 0,
        ...(selection.error ? { message: selection.error } : {}),
      });
    },
  );
  app.get(
    "/anime/:id/download/:ticket",
    {
      exposeHeadRoute: false,
      config: { rateLimit: { max: 60, timeWindow: "10 minutes" } },
    },
    async (req, reply) => {
      const { selection, id } = await readTicket(req.params);
      ensurePrepared(selection);
      await selection.preparing;
      if (!selection.file) throw new UpstreamUnavailableError(selection.error);
      const range = downloadRange(req.headers.range, selection.file.bytes);
      if (!range)
        return reply
          .code(416)
          .header("content-range", "bytes */" + selection.file.bytes)
          .send();
      if (selection.downloaded && !range.partial)
        throw new NotFoundError("Нажмите «Скачать» ещё раз.");
      selection.downloaded = true;
      selection.expires = Date.now() + 30 * 60_000;
      reply
        .code(range.partial ? 206 : 200)
        .type("video/mp4")
        .header("cache-control", "private, no-store, no-transform")
        .header("accept-ranges", "bytes")
        .header("content-length", range.end - range.start + 1)
        .header(
          "content-disposition",
          'attachment; filename="anime-' +
            id +
            "-ep-" +
            selection.episode +
            ".mp4\"; filename*=UTF-8''" +
            encodeURIComponent(selection.filename),
        );
      if (range.partial)
        reply.header(
          "content-range",
          "bytes " + range.start + "-" + range.end + "/" + selection.file.bytes,
        );
      const stream = createReadStream(selection.file.path, {
        start: range.start,
        end: range.end,
      });
      reply.raw.once("close", () => stream.destroy());
      return reply.send(stream);
    },
  );
}
