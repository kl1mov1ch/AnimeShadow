import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";

const RESERVE = 512 * 1024 * 1024;
let converter: Promise<string> | undefined;
export function downloadConverter() {
  return (converter ??= (async () => {
    const candidates = process.env.FFMPEG_PATH
      ? [process.env.FFMPEG_PATH, "ffmpeg", ffmpegStatic]
      : process.platform === "win32"
        ? [ffmpegStatic, "ffmpeg"]
        : ["ffmpeg", ffmpegStatic];
    for (const binary of [
      ...new Set(candidates.filter((s): s is string => Boolean(s))),
    ]) {
      const works = await new Promise<boolean>((resolve) => {
        execFile(binary, ["-version"], { windowsHide: true, timeout: 5000 }, (error) =>
          resolve(!error),
        );
      });
      if (works) return binary;
    }
    converter = undefined;
    throw new Error("FFmpeg unavailable: install ffmpeg or configure FFMPEG_PATH");
  })());
}

export type DownloadFile = { path: string; bytes: number; remove: () => Promise<void> };

/** Bounded, complete MP4 on disk. No JSON/error body can become a successful movie download. */
export async function prepareDownloadFile(
  input: string,
  hls: boolean,
  signal: AbortSignal,
  progress: (bytes: number) => void,
): Promise<DownloadFile> {
  const binary = await downloadConverter();
  signal.throwIfAborted();
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, "animeshadow-episode-"));
  if (
    dirname(resolve(directory)) !== temporaryRoot ||
    !basename(directory).startsWith("animeshadow-episode-")
  )
    throw new Error("Invalid episode temporary directory");
  const path = join(directory, "episode.mp4");
  const remove = () => rm(directory, { recursive: true, force: true });
  try {
    const disk = await statfs(directory);
    const limit = Math.min(
      4 * 1024 ** 3,
      Math.floor((disk.bavail * disk.bsize - RESERVE) / 2),
    );
    if (limit < 64 * 1024 * 1024)
      throw new Error("Not enough free space to prepare an episode");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        binary,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-xerror",
          "-threads",
          "1",
          "-rw_timeout",
          "120000000",
          "-protocol_whitelist",
          "file,http,tcp,crypto",
          ...(hls ? ["-allowed_extensions", "ALL"] : []),
          "-i",
          input,
          "-map",
          "0:v:0",
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
          "-fs",
          String(limit),
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
          "-y",
          path,
        ],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      let diagnostic = "",
        failure: Error | undefined,
        checking = false;
      const stop = () => {
        failure ??= new Error("Download preparation cancelled");
        child.kill();
      };
      const timeout = setTimeout(() => {
        failure = new Error("Download preparation timed out");
        stop();
      }, 20 * 60_000);
      const monitor = setInterval(() => {
        if (checking) return;
        checking = true;
        void Promise.all([stat(path).catch(() => null), statfs(directory)])
          .then(([file, free]) => {
            if (file) progress(file.size);
            if (
              (file && file.size >= limit - 1024 * 1024) ||
              free.bavail * free.bsize < RESERVE
            ) {
              failure = new Error("Episode exceeds available download space");
              stop();
            }
          })
          .catch(() => {
            failure = new Error("Cannot write episode file");
            stop();
          })
          .finally(() => {
            checking = false;
          });
      }, 1000);
      const clean = () => {
        clearTimeout(timeout);
        clearInterval(monitor);
        signal.removeEventListener("abort", stop);
      };
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-6000);
      });
      child.once("error", (error) => {
        clean();
        reject(error);
      });
      child.once("close", (code) => {
        clean();
        if (failure || code !== 0)
          reject(failure ?? new Error(`Converter exited ${code}: ${diagnostic}`));
        else resolve();
      });
    });
    const file = await stat(path);
    if (file.size < 1024 || file.size >= limit - 1024 * 1024)
      throw new Error("Incomplete episode file");
    signal.throwIfAborted();
    return { path, bytes: file.size, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}

export function downloadRange(range: string | undefined, bytes: number) {
  if (!range) return { start: 0, end: bytes - 1, partial: false };
  const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  const suffix = !match[1];
  const start = suffix ? Math.max(0, bytes - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? bytes - 1 : Math.min(bytes - 1, Number(match[2]));
  if (start < 0 || start >= bytes || end < start) return null;
  return { start, end, partial: true };
}
