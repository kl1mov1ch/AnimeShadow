import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { WatchSource } from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";

interface Episode {
  id: number;
  id_translation: number;
  translation?: string;
  seasons?: number;
  episode?: number;
}
interface FileList {
  type: string;
  active: Episode;
  all?: Record<string, Record<string, Record<string, Episode>>>;
}
interface Page {
  files: FileList;
  token: string;
  nonce: string;
  origin: string;
}
interface Session {
  animeId: number;
  headers: Record<string, string>;
  assets: Map<string, string>;
  touched: number;
  created: number;
}

/** Reads a JSON.parse('…') data literal. Provider scripts are never evaluated. */
export function allohaJson(html: string, name: string): unknown {
  const match = new RegExp(
    `\\bconst\\s+${name}\\s*=\\s*JSON\\.parse\\(\\s*'((?:\\\\.|[^'\\\\])*)'\\s*\\)`,
  ).exec(html);
  if (!match) throw new Error("Alloha catalogue missing");
  const raw = match[1]!;
  let decoded = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\") {
      decoded += raw[i];
      continue;
    }
    const next = raw[++i];
    if (next === "'" || next === '"' || next === "\\") decoded += next;
    else if (next === "u" || next === "x") {
      const size = next === "u" ? 4 : 2;
      const hex = raw.slice(i + 1, i + 1 + size);
      if (!new RegExp(`^[0-9a-f]{${size}}$`, "i").test(hex))
        throw new Error("Invalid literal");
      decoded += String.fromCharCode(parseInt(hex, 16));
      i += size;
    } else if (next === "n") decoded += "\n";
    else if (next === "r") decoded += "\r";
    else if (next === "t") decoded += "\t";
    else throw new Error("Unsupported literal escape");
  }
  return JSON.parse(decoded);
}

/** The three data permutations used by the current public Alloha player. */
export function allohaNonce(value: string): string {
  if (value.length < 2) return value;
  if (value.length > 4096) throw new Error("Invalid Alloha nonce");
  const bits = Math.ceil(Math.log2(value.length));
  const highBit = (n: number) => (n === 0 ? 0 : Math.floor(Math.log2(n)) + 1);
  const lowBit = (n: number) => {
    if (n === 0) return bits;
    let count = 0;
    while ((n & 1) === 0) {
      count++;
      n >>= 1;
    }
    return count;
  };
  const ungroup = (text: string, bucket: (n: number) => number, reverse: boolean) => {
    const counts = new Array<number>(bits + 1).fill(0);
    for (let i = 0; i < text.length; i++) counts[bucket(i)]!++;
    const chunks = new Array<string>(bits + 1);
    let offset = 0;
    for (let step = 0; step <= bits; step++) {
      const b = reverse ? bits - step : step;
      chunks[b] = text.slice(offset, offset + counts[b]!);
      offset += counts[b]!;
    }
    const indices = new Array<number>(bits + 1).fill(0);
    return Array.from({ length: text.length }, (_, i) => {
      const b = bucket(i);
      return chunks[b]!.charAt(indices[b]!++);
    }).join("");
  };
  const decoded = ungroup(ungroup(value, highBit, true), lowBit, false);
  const prime = (n: number) => {
    if (n < 2) return false;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
    return true;
  };
  let modulus = value.length + 1;
  while (!prime(modulus)) modulus++;
  const seen = new Set<number>();
  const out = new Array<string>(value.length);
  let position = 0,
    index = 0;
  while (index < value.length) {
    position = (position + 2) % modulus;
    if (position < value.length && !seen.has(position)) {
      seen.add(position);
      out[position] = decoded[index++]!;
    }
  }
  return out.join("");
}

function embedUrl(value: string): URL {
  const url = new URL(value);
  // This integration only follows known Alloha embeds stored by its API.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !/^(?:theatre\.)?stravers\.live$|^(?:[a-z0-9-]+\.)?alloha\.(?:tv|club|online)$/i.test(
      url.hostname,
    )
  )
    throw new Error("Unexpected Alloha mirror");
  return url;
}
export function allohaMediaUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/^[a-z0-9-]+\.vkvideo\.cloud$/i.test(url.hostname) ||
    (url.port && url.port !== "443")
  )
    throw new Error("Unexpected Alloha CDN");
  return url.href;
}

async function readText(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("Response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class AllohaStreams {
  private readonly catalogues = new TtlCache<Page>(10 * 60_000, 512);
  private streams = new TtlCache<string>(90_000, 256);
  private readonly sessions = new Map<string, Session>();
  private active = 0;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  invalidateCatalogue(link: string) {
    this.catalogues.delete(link);
  }

  invalidateStreams() {
    this.streams = new TtlCache<string>(90_000, 256);
  }

  private async page(link: string): Promise<Page> {
    const url = embedUrl(link);
    const response = await this.fetchImpl(url, {
      headers: { referer: "https://animeshadow.online/", "user-agent": "Mozilla/5.0" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      void response.body?.cancel();
      throw new Error("Alloha unavailable");
    }
    const html = await readText(response, 1_000_000);
    const files = allohaJson(html, "fileList") as FileList;
    const token = /\btoken:\s*'([a-z0-9_.-]+)'/i.exec(html)?.[1];
    const nonce = /<meta[^>]*name=["']viewporti["'][^>]*content=["']([^"']+)["']/i.exec(
      html,
    )?.[1];
    if (!token || !nonce || !files.active || !["serial", "movie"].includes(files.type))
      throw new Error("Alloha page changed");
    return { files, token, nonce, origin: url.origin };
  }

  async getSources(animeId: number, sources: WatchSource[]): Promise<WatchSource[]> {
    const candidates = sources.filter((s) => s.id.startsWith("alloha:"));
    if (!candidates.length) return [];
    const first = candidates[0]!;
    const page = await this.catalogues.wrap(first.embedUrl, () =>
      this.page(first.embedUrl),
    );
    const season = String(page.files.active.seasons ?? 1);
    const choices =
      first.id === "alloha:main"
        ? [
            {
              ...first,
              id: `alloha:${page.files.active.id_translation}`,
              title: page.files.active.translation || first.title,
            },
          ]
        : candidates;
    return choices.flatMap((source) => {
      const dub = source.id.split(":")[1]!;
      if (!/^\d+$/.test(dub)) return [];
      const episodes =
        page.files.type === "serial"
          ? Object.entries(page.files.all?.[season] ?? {})
              .filter(([, translations]) => translations[`t${dub}`])
              .map(([ep]) => ep)
          : Number(dub) === page.files.active.id_translation
            ? ["1"]
            : [];
      const valid = episodes.filter((ep) => /^[1-9]\d{0,3}$/.test(ep));
      if (!valid.length) return [];
      const entry =
        page.files.type === "serial"
          ? Object.values(page.files.all?.[season] ?? {})
              .map((translations) => translations[`t${dub}`])
              .find(Boolean)
          : page.files.active;
      const name = entry?.translation;
      return [
        {
          ...source,
          ...(name
            ? {
                title: `${name} · Alloha`,
                kind: /субтит|subtitle/i.test(name)
                  ? ("subtitles" as const)
                  : ("voice" as const),
              }
            : {}),
          format: "hls" as const,
          embedUrl: "",
          stable: null,
          episodesCount: valid.length,
          iframeEpisodes: undefined,
          hlsEpisodes: Object.fromEntries(
            valid.map((ep) => [
              ep,
              `/api/anime/${animeId}/streams/alloha/${dub}/${ep}/master.m3u8`,
            ]),
          ),
        },
      ];
    });
  }

  async master(
    animeId: number,
    dub: string,
    episode: number,
    link: string,
  ): Promise<string> {
    return this.streams.wrap(`${animeId}:${dub}:${episode}`, async () => {
      if (this.active >= 4)
        throw new UpstreamUnavailableError("Источник занят. Повторите загрузку.");
      this.active++;
      try {
        const page = await this.page(link);
        const file =
          page.files.type === "serial"
            ? page.files.all?.[String(page.files.active.seasons ?? 1)]?.[
                String(episode)
              ]?.[`t${dub}`]
            : episode === 1 && Number(dub) === page.files.active.id_translation
              ? page.files.active
              : undefined;
        if (!file || !Number.isSafeInteger(file.id))
          throw new NotFoundError("Этой серии нет в выбранной озвучке.");
        const fingerprint = createHash("sha256").update(randomUUID()).digest("hex");
        const response = await this.fetchImpl(`${page.origin}/bnsi/movies/${file.id}`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: page.origin,
            referer: link,
            "user-agent": "Mozilla/5.0",
            Borth: `${fingerprint}|${allohaNonce(page.nonce)}`,
          },
          body: new URLSearchParams({
            token: page.token,
            av1: "false",
            autoplay: "0",
            audio: "",
            subtitle: "",
          }),
        });
        if (!response.ok) {
          void response.body?.cancel();
          throw new Error("Alloha stream unavailable");
        }
        const body = JSON.parse(await readText(response, 1_000_000)) as {
          hlsSource?: Array<{
            label?: string;
            audioId?: string;
            quality?: Record<string, string>;
          }>;
        };
        const tracks = body.hlsSource ?? [];
        const session: Session = {
          animeId,
          headers: {
            "Accepts-Controls": fingerprint,
            origin: page.origin,
            referer: `${page.origin}/`,
            "user-agent": "Mozilla/5.0",
          },
          assets: new Map(),
          touched: Date.now(),
          created: Date.now(),
        };
        this.sweep();
        if (this.sessions.size >= 256) throw new Error("Alloha sessions full");
        const sessionId = randomUUID();
        const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
        const heights = new Set<number>();
        // Match the provider's default track for this translation. Duplicate
        // resolutions must not become random mirrors with different audio.
        for (const track of tracks.slice(0, 1)) {
          for (const [quality, mirrors] of Object.entries(track.quality ?? {})) {
            const height = Number(quality);
            if (
              !/^\d{3,4}$/.test(quality) ||
              height > 4320 ||
              typeof mirrors !== "string"
            )
              continue;
            const urls = mirrors
              .split(/\s+or\s+/)
              .slice(0, 4)
              .flatMap((value) => {
                try {
                  return [allohaMediaUrl(value)];
                } catch {
                  return [];
                }
              });
            if (!urls.length) continue;
            const uri = this.asset(sessionId, session, urls.join("\n"));
            heights.add(height);
            lines.push(
              `#EXT-X-STREAM-INF:BANDWIDTH=${Math.max(300000, height * height * 7)},RESOLUTION=${Math.round((height * 16) / 9 / 2) * 2}x${height}`,
              uri,
            );
          }
        }
        if (!heights.size) throw new Error("No Alloha HLS streams");
        this.sessions.set(sessionId, session);
        return lines.join("\n") + "\n";
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof UpstreamUnavailableError)
          throw error;
        throw new UpstreamUnavailableError(
          "Alloha временно не отдаёт видео. Выберите другую озвучку или повторите загрузку.",
        );
      } finally {
        this.active--;
      }
    });
  }

  private sweep() {
    for (const [key, session] of this.sessions)
      if (
        Date.now() - session.touched > 30 * 60_000 ||
        Date.now() - session.created > 3 * 60 * 60_000
      )
        this.sessions.delete(key);
  }
  private asset(id: string, session: Session, url: string): string {
    const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
    if (session.assets.size >= 5000 && !session.assets.has(key))
      throw new Error("Playlist too large");
    session.assets.set(key, url);
    return `/api/anime/${session.animeId}/streams/alloha/session/${id}/${key}`;
  }

  async sendAsset(
    animeId: number,
    id: string,
    key: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    this.sweep();
    const session = this.sessions.get(id);
    const stored = session?.assets.get(key);
    if (!session || session.animeId !== animeId || !stored)
      throw new NotFoundError("Поток устарел. Повторите загрузку.");
    session.touched = Date.now();
    const controller = new AbortController();
    const close = () => controller.abort();
    reply.raw.once("close", close);
    const deadline = setTimeout(close, 20_000);
    deadline.unref();
    const cleanup = () => {
      clearTimeout(deadline);
      reply.raw.off("close", close);
    };
    try {
      const range = request.headers.range;
      if (range && !/^bytes=\d{1,12}-\d{1,12}$/.test(range)) {
        cleanup();
        return reply.code(416).send();
      }
      if (range) {
        const [start, end] = range.slice(6).split("-").map(Number);
        if (end! < start! || end! - start! > 48 * 1024 * 1024) {
          cleanup();
          return reply.code(416).send();
        }
      }
      let response: Response | undefined;
      let target = "";
      for (const candidate of stored.split("\n")) {
        target = allohaMediaUrl(candidate);
        const upstream = await this.fetchImpl(target, {
          headers: { ...session.headers, ...(range ? { Range: range } : {}) },
          redirect: "error",
          signal: controller.signal,
        });
        if (upstream.ok) {
          response = upstream;
          break;
        }
        void upstream.body?.cancel();
      }
      if (!response?.body) throw new Error("Alloha CDN unavailable");
      reply.header("cache-control", "private, no-store");
      if (new URL(target).pathname.endsWith(".m3u8")) {
        const text = await readText(response, 1_000_000);
        if (!text.trimStart().startsWith("#EXTM3U"))
          throw new Error("Invalid Alloha playlist");
        const rewrite = (uri: string) =>
          this.asset(id, session, allohaMediaUrl(uri, target));
        const manifest = text
          .split(/\r?\n/)
          .map((line) =>
            line.startsWith("#")
              ? line.replace(
                  /URI="([^"\r\n]+)"/g,
                  (_, uri: string) => `URI="${rewrite(uri)}"`,
                )
              : line.trim()
                ? rewrite(line.trim())
                : line,
          )
          .join("\n");
        cleanup();
        return reply.type("application/vnd.apple.mpegurl").send(manifest);
      }
      // Stream segments with backpressure; never buffer or save a complete episode.
      const type =
        response.headers.get("content-type")?.split(";")[0] ??
        "application/octet-stream";
      if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4))/.test(type)) {
        void response.body.cancel();
        throw new Error("Invalid segment");
      }
      if (Number(response.headers.get("content-length")) > 48 * 1024 * 1024) {
        void response.body.cancel();
        throw new Error("Segment too large");
      }
      let bytes = 0;
      const bounded = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          done(bytes > 48 * 1024 * 1024 ? new Error("Segment too large") : null, chunk);
        },
      });
      const upstream = Readable.fromWeb(response.body as never);
      upstream.on("error", (error) => bounded.destroy(error));
      bounded.once("close", () => {
        cleanup();
        controller.abort();
        upstream.destroy();
      });
      reply.code(response.status);
      for (const header of ["content-range", "content-length", "accept-ranges"]) {
        const value = response.headers.get(header);
        if (value) reply.header(header, value);
      }
      return reply.type(type).send(upstream.pipe(bounded));
    } catch {
      cleanup();
      controller.abort();
      throw new UpstreamUnavailableError(
        "Видеосервер Alloha временно недоступен. Повторите загрузку.",
      );
    }
  }
}
