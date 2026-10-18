import { z } from "zod";

/**
 * The edition of the site's legal documents (user agreement, privacy policy,
 * consent to data processing) in force — recorded with every account's
 * consent. Raise it (the date) whenever a document's meaning changes.
 */
export const LEGAL_VERSION = "2026-10-19";

const text = (max: number) => z.string().trim().max(max).default("");

/**
 * Who runs the site, as the documents name them — edited by the admin right
 * on /legal and kept on the server (data/legal.json), so a new name, ИНН or
 * address reaches every document at once, with no deploy.
 */
export const legalOperatorSchema = z.object({
  /** Full name (ФИО) or company name. */
  name: text(200),
  /** "самозанятый (плательщик НПД)", "индивидуальный предприниматель", "ООО"… */
  status: text(120),
  inn: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{12})?$/, "ИНН — 10 или 12 цифр")
    .default(""),
  /** ОГРН / ОГРНИП. */
  ogrn: z
    .string()
    .trim()
    .regex(/^(\d{13}|\d{15})?$/, "ОГРН — 13 цифр, ОГРНИП — 15")
    .default(""),
  address: text(300),
  email: z.string().trim().email("Укажите почту").max(200),
  telegram: z.union([z.literal(""), z.string().trim().url("Ссылка вида https://t.me/…").max(200)]).default(""),
  paymentsName: text(80),
  paymentsUrl: z.union([z.literal(""), z.string().trim().url("Ссылка вида https://…").max(200)]).default(""),
});
export type LegalOperator = z.infer<typeof legalOperatorSchema>;

export const LEGAL_OPERATOR_DEFAULT: LegalOperator = {
  name: "",
  status: "",
  inn: "",
  ogrn: "",
  address: "",
  email: "admin@animeshadow.online",
  telegram: "https://t.me/shadowani",
  paymentsName: "MulenPay",
  paymentsUrl: "https://mulenpay.com",
};
