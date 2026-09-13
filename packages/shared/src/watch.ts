import { z } from "zod";

/** One playable variant: a dub/sub track from the embed provider. */
export const watchSourceSchema = z.object({
  id: z.string(),
  /** Human label, e.g. "AniLibria.TV", "Оригинал (яп.) + субтитры". */
  title: z.string(),
  /** "voice" (dub) | "subtitles" | "unknown" */
  kind: z.enum(["voice", "subtitles", "unknown"]),
  /**
   * "iframe" (default — Kodik, Alloha, the custom template): `embedUrl` is a
   * whole-series player the viewer navigates episodes inside of; our own
   * episode counter is just a self-reported bookmark, since the embed gives
   * us no way to read or drive its actual episode. "hls": `embedUrl` is
   * unused and `hlsEpisodes` maps episode number → a direct HLS manifest URL
   * we actually control — the episode stepper really does switch playback.
   */
  format: z.enum(["iframe", "hls"]).default("iframe"),
  /** Fully-qualified iframe src (format "iframe"). */
  embedUrl: z.string(),
  /** format "hls" only: episode number (as a string key) → HLS manifest URL. */
  hlsEpisodes: z.record(z.string(), z.string()).optional(),
  quality: z.string().nullable(),
  episodesCount: z.number().int().nullable(),
  /** Reachability probe: true = verified playable, false = failed, null = not checked yet. */
  stable: z.boolean().nullable().default(null),
});
export type WatchSource = z.infer<typeof watchSourceSchema>;

export const watchResponseSchema = z.object({
  available: z.boolean(),
  /** Why nothing is playable: not configured, nothing found, provider error. */
  reason: z.enum(["ok", "not_configured", "not_found", "provider_error"]),
  provider: z.string().nullable(),
  sources: z.array(watchSourceSchema),
});
export type WatchResponse = z.infer<typeof watchResponseSchema>;
