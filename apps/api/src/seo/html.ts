import { env } from "../config/env.js";

/** The public origin, e.g. https://animeshadow.online — no trailing slash. */
export const SITE = env.APP_URL;
export const BRAND = "AnimeShadow";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
/** JSON for a <script type="application/ld+json">: `<` escaped so no value can close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).split("<").join("\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
}

/** Whitespace folded and cut at a word, with an ellipsis, to at most `max` characters. */
export function clip(text: string | null | undefined, max: number): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

export function absolute(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

const RU_PLURAL = new Intl.PluralRules("ru-RU");
/** "1 серия", "3 серии", "12 серий". */
export function plural(n: number, one: string, few: string, many: string): string {
  const form = RU_PLURAL.select(n);
  return `${n.toLocaleString("ru-RU")} ${form === "one" ? one : form === "few" ? few : many}`;
}
