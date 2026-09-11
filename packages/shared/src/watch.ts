import { z } from "zod";

/** One playable variant: a dub/sub track from the embed provider. */
export const watchSourceSchema = z.object({
  id: z.string(),
  /** Human label, e.g. "AniLibria.TV", "Оригинал (яп.) + субтитры". */
  title: z.string(),
  /** "voice" (dub) | "subtitles" | "unknown" */
  kind: z.enum(["voice", "subtitles", "unknown"]),
  /** Fully-qualified iframe src. */
  embedUrl: z.string(),
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
