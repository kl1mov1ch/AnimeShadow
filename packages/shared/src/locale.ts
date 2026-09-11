import { z } from "zod";

export const localeSchema = z.enum(["ru", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALES: Locale[] = ["ru", "en"];

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
};

/** Query param accepted by catalogue endpoints to localise free text. */
export const localeQuerySchema = z.object({
  lang: localeSchema.default(DEFAULT_LOCALE),
});
