import { z } from "zod";

const shortText = (max: number) => z.string().trim().max(max).optional();

/** One SPA route visit, reported by the frontend beacon. `visitorId` is a
 * random id the browser keeps in localStorage — never an IP address. The
 * device, browser and OS are read from the request's user agent on the
 * server, not sent. */
export const pageViewInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
  referrer: shortText(500),
  visitorId: z.string().trim().min(1).max(100),
  /** The browser's own id for this view, for the later "left" beacon. */
  clientId: shortText(100),
  sessionId: shortText(100),
  /** First view of its session. */
  entry: z.boolean().optional(),
  /** document.referrer when the session started, if it was another site. */
  sessionRef: shortText(500),
  lang: shortText(20),
  screenW: z.number().int().min(0).max(20000).optional(),
  utmSource: shortText(120),
  utmMedium: shortText(120),
  utmCampaign: shortText(160),
});
export type PageViewInput = z.infer<typeof pageViewInputSchema>;

/** Sent with sendBeacon when a page is left: how long it was visible. */
export const pageLeaveInputSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  visitorId: z.string().trim().min(1).max(100),
  durationMs: z.number().int().min(0).max(6 * 60 * 60_000),
});
export type PageLeaveInput = z.infer<typeof pageLeaveInputSchema>;
