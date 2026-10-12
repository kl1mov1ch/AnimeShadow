import { z } from "zod";

/** Why a profile is reported. */
export const REPORT_REASONS = ["spam", "abuse", "content", "impersonation", "other"] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const createProfileReportInputSchema = z.object({
  reason: reportReasonSchema,
  comment: z.string().trim().max(500).optional(),
});
export type CreateProfileReportInput = z.infer<typeof createProfileReportInputSchema>;

export interface ProfileReportResult {
  /** An open complaint from the same person was already there — it was updated, not doubled. */
  already: boolean;
}

/** What an admin can do about a reported profile, besides dismissing. */
export const REPORT_MEASURES = ["avatar", "banner", "bio", "wall", "ban"] as const;
export const reportMeasureSchema = z.enum(REPORT_MEASURES);
export type ReportMeasure = z.infer<typeof reportMeasureSchema>;

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const adminReportQuerySchema = z.object({
  status: z.enum(["open", "resolved", "dismissed", "all"]).default("open"),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
});
export type AdminReportQuery = z.infer<typeof adminReportQuerySchema>;

export const adminResolveReportsInputSchema = z
  .object({
    action: z.enum(["resolve", "dismiss"]),
    measures: z.array(reportMeasureSchema).max(REPORT_MEASURES.length).default([]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.action === "dismiss" || v.measures.length > 0, { message: "Pick at least one measure" });
export type AdminResolveReportsInput = z.infer<typeof adminResolveReportsInputSchema>;

export interface AdminReportPerson {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface AdminReportItem {
  id: string;
  reason: ReportReason;
  comment: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: AdminReportPerson;
}

/** Every complaint about one profile, with the profile as it is now. */
export interface AdminReportGroup {
  target: AdminReportPerson & {
    bannerUrl: string | null;
    bio: string | null;
    isBanned: boolean;
    role: string;
    createdAt: string;
  };
  /** Complaints still waiting for a decision. */
  open: number;
  /** Complaints shown here (under the chosen filter). */
  total: number;
  reasons: Array<{ reason: ReportReason; count: number }>;
  lastAt: string;
  reports: AdminReportItem[];
  /** The last decision taken about this profile, if any. */
  decision: {
    status: Exclude<ReportStatus, "OPEN">;
    measures: ReportMeasure[];
    note: string | null;
    at: string;
    by: string | null;
  } | null;
}

export interface AdminResolveReportsResult {
  closed: number;
}
