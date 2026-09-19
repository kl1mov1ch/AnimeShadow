import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestError } from "./errors.js";

export type UserImageKind = "avatars" | "banners";
export type ImageExt = "png" | "jpg" | "webp" | "gif";

export const IMAGE_CONTENT_TYPE: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * What the bytes actually are, read from their first few — never from the
 * name or a header someone else set. The file is later served with a
 * content type chosen by its extension, so the extension has to be true.
 */
export function sniffImage(bytes: Buffer): ImageExt | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.toString("ascii", 0, 3) === "GIF") return "gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export function decodeImageDataUrl(dataUrl: string, maxBytes: number): { bytes: Buffer; ext: ImageExt } {
  const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) throw new BadRequestError("Ожидается картинка в формате data:image/…;base64.");
  const bytes = Buffer.from(match[1]!, "base64");
  if (bytes.byteLength > maxBytes) {
    throw new BadRequestError(`Файл больше ${Math.round(maxBytes / 1024 / 1024)} МБ.`);
  }
  const ext = sniffImage(bytes);
  if (!ext) throw new BadRequestError("Это не PNG, JPEG, WebP или GIF.");
  return { bytes, ext };
}

const LOCAL_URL = /^\/uploads\/(avatars|banners)\/([A-Za-z0-9_.-]+?)(?:\?.*)?$/;

/**
 * Avatars and profile backgrounds, kept on our own disk.
 *
 * Every picture a profile shows lives here — including the random ones,
 * which are downloaded rather than linked — so a profile never breaks
 * because some other site deleted or moved a file.
 *
 * Each save gets a fresh name, and the file it replaces is deleted only after
 * the new one is written and the account points at it: a failure part-way
 * leaves the old picture in place, never a dangling link.
 */
export class UserImageStore {
  constructor(private readonly root: string) {}

  async save(kind: UserImageKind, userId: string, bytes: Buffer, ext: ImageExt): Promise<string> {
    const dir = join(this.root, kind);
    await mkdir(dir, { recursive: true });
    const safeId = userId.replace(/[^A-Za-z0-9_-]/g, "");
    const file = `${safeId}-${randomBytes(6).toString("hex")}.${ext}`;
    await writeFile(join(dir, file), bytes);
    return `/uploads/${kind}/${file}`;
  }

  /** Deletes a file we host. Anything else — an outside link, null — is left alone. */
  async removeIfLocal(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const match = LOCAL_URL.exec(url);
    if (!match) return;
    await unlink(join(this.root, match[1]!, match[2]!)).catch(() => undefined);
  }

  /** Fetches a picture from elsewhere so it can be kept here. */
  async download(
    url: string,
    maxBytes: number,
    headers: Record<string, string> = {},
  ): Promise<{ bytes: Buffer; ext: ImageExt } | null> {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > maxBytes) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) return null;
      const ext = sniffImage(bytes);
      return ext ? { bytes, ext } : null;
    } catch {
      return null;
    }
  }
}
