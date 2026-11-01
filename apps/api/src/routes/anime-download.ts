import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import ffmpeg from "ffmpeg-static";
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
};
type Job = {
  animeId: number;
  userId: string;
  assets: Map<string, string>;
  manifests: Map<string, string>;
  roots: Set<string>;
  localOrigin: string;
  active: boolean;
  height?: number;
};

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
    for (const stop of running) stop();
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
    for (const [key, value] of tickets)
      if (value.expires < Date.now()) tickets.delete(key);
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
      return reply
        .header("cache-control", "private, no-store")
        .send({ url: `/api/anime/${id}/download/${key}`, filename });
    },
  );

  // FFmpeg can read only these short-lived loopback URLs. It never receives a CDN URL.
  app.get(
    "/anime/:id/download-assets/:job/:asset",
    { config: { rateLimit: { max: 1200, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = parse(
        params.extend({
          job: z.string().regex(/^[a-f0-9]{48}$/),
          asset: z.string().regex(/^[a-f0-9]{48}$/),
        }),
        req.params,
      );
      const job = jobs.get(p.job);
      const target = job?.assets.get(p.asset);
      const inlineManifest = job?.manifests.get(p.asset);
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
      const close = () => abort.abort();
      reply.raw.once("close", close);
      const directFile = new URL(target!).pathname.endsWith(".mp4");
      const timeout = setTimeout(close, directFile ? 2 * 60 * 60_000 : 30_000);
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
        const response = await fetch(target!, {
          headers: range ? { range } : {},
          redirect: "error",
          signal: abort.signal,
        });
        if (!response.ok || !response.body) throw new Error("Download CDN unavailable");
        const type = response.headers.get("content-type") ?? "";
        if (/mpegurl/i.test(type) || new URL(target!).pathname.endsWith(".m3u8")) {
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
            target!,
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
              return `${job.localOrigin}/api/anime/${p.id}/download-assets/${p.job}/${key}`;
            },
          );
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
        stream.on("error", (e) => bounded.destroy(e));
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
      } catch {
        clean();
        abort.abort();
        throw new UpstreamUnavailableError("Не удалось получить фрагмент серии.");
      } finally {
        if (reply.sent) clean();
      }
    },
  );

  app.get(
    "/anime/:id/download/:ticket",
    {
      exposeHeadRoute: false,
      config: { rateLimit: { max: 6, timeWindow: "10 minutes" } },
    },
    async (req, reply) => {
      const { id, ticket } = parse(
        params.extend({ ticket: z.string().regex(/^[a-f0-9]{48}$/) }),
        req.params,
      );
      sweep();
      const selection = tickets.get(ticket);
      if (!selection || selection.animeId !== id)
        throw new NotFoundError("Ссылка устарела. Нажмите «Скачать» ещё раз.");
      tickets.delete(ticket);
      await paidUser(selection.userId);
      if (
        jobs.size >= 2 ||
        [...jobs.values()].some((j) => j.userId === selection.userId)
      )
        throw new TooManyRequestsError(
          "Дождитесь завершения текущего скачивания и повторите попытку.",
        );
      const address = app.server.address();
      if (!address || typeof address === "string") throw new UpstreamUnavailableError();
      const origin = `http://127.0.0.1:${address.port}`;
      const jobKey = token();
      const job: Job = {
        animeId: id,
        userId: selection.userId,
        assets: new Map(),
        manifests: new Map(),
        roots: new Set(),
        localOrigin: origin,
        active: true,
        ...(selection.height ? { height: selection.height } : {}),
      };
      jobs.set(jobKey, job);
      let process: ReturnType<typeof spawn> | undefined;
      // Assigned after cleanup is declared, which also cancels it.
      // eslint-disable-next-line prefer-const
      let deadline: NodeJS.Timeout | undefined;
      const cleanup = () => {
        if (!job.active) return;
        job.active = false;
        jobs.delete(jobKey);
        running.delete(cleanup);
        process?.kill();
        if (deadline) clearTimeout(deadline);
      };
      running.add(cleanup);
      reply.raw.once("close", cleanup);
      deadline = setTimeout(cleanup, 2 * 60 * 60_000);
      deadline.unref();
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
              return `${origin}/api/anime/${id}/download-assets/${jobKey}/${key}`;
            },
          );
          const manifestKey = token();
          job.manifests.set(manifestKey, local);
          media = `${origin}/api/anime/${id}/download-assets/${jobKey}/${manifestKey}`;
        } else if (provider === "animevost")
          media = await watch.getAnimeVostStream(
            id,
            parts.join(":"),
            selection.episode,
          );
        if (!media.startsWith(`${origin}/api/anime/${id}/download-assets/${jobKey}/`)) {
          if (!safeExternalUrl(media))
            throw new UpstreamUnavailableError(
              "Скачивание этой серии пока недоступно.",
            );
          job.roots.add(new URL(media).origin);
          const key = token();
          job.assets.set(key, media);
          media = `${origin}/api/anime/${id}/download-assets/${jobKey}/${key}`;
        }
        if (!job.active) throw new Error("Download cancelled");
        process = spawn(
          ffmpeg ?? "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-threads",
            "1",
            "-protocol_whitelist",
            "pipe,http,tcp,crypto",
            ...(source.format === "hls" ? ["-allowed_extensions", "ALL"] : []),
            "-i",
            media,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-threads",
            "1",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-f",
            "mp4",
            "pipe:1",
          ],
          { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
        );
        const child = process;
        child.stdin!.on("error", () => {});
        let diagnostic = "";
        child.stderr!.on("data", (chunk: Buffer) => {
          diagnostic = (diagnostic + chunk.toString()).slice(-6000);
        });
        child.stdin!.end();
        // Report preparation errors before sending an empty successful download.
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Download preparation timeout")),
            35_000,
          );
          const done = (error?: Error) => {
            clearTimeout(timeout);
            child.off("error", failed);
            child.off("exit", exited);
            child.stdout!.off("readable", ready);
            if (error) reject(error);
            else resolve();
          };
          const failed = () => done(new Error("Converter unavailable"));
          const exited = () => done(new Error("No video output: " + diagnostic));
          const ready = () => {
            if (child.stdout!.readableLength) done();
          };
          child.once("error", failed);
          child.once("exit", exited);
          child.stdout!.on("readable", ready);
        });
        child.on("error", () =>
          child.stdout!.destroy(new Error("Скачивание прервано")),
        );
        child.on("exit", (code) => {
          if (code && job.active)
            child.stdout!.destroy(new Error("Скачивание прервано"));
        });
        child.stdout!.once("close", cleanup);
        return reply
          .type("video/mp4")
          .header("cache-control", "private, no-store")
          .header(
            "content-disposition",
            `attachment; filename="anime-${id}-ep-${selection.episode}.mp4"; filename*=UTF-8''${encodeURIComponent(selection.filename)}`,
          )
          .send(child.stdout);
      } catch (error) {
        req.log.warn(
          {
            animeId: id,
            reason: String(error).replace(/https?:\/\/[^\s]+/g, "[stream]"),
          },
          "Episode download preparation failed",
        );
        cleanup();
        if (error instanceof NotFoundError) throw error;
        throw new UpstreamUnavailableError(
          "Не удалось подготовить серию. Попробуйте другую озвучку или повторите позже.",
        );
      }
    },
  );
}
