import { z } from "zod";

/** One SPA route visit, reported by the frontend beacon. `visitorId` is a
 * random id the browser keeps in localStorage — never an IP address. */
export const pageViewInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
  referrer: z.string().trim().max(500).optional(),
  visitorId: z.string().trim().min(1).max(100),
});
export type PageViewInput = z.infer<typeof pageViewInputSchema>;
