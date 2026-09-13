export * from "./enums.js";
export * from "./locale.js";
export * from "./pagination.js";
export * from "./anime.js";
export * from "./auth.js";
export * from "./library.js";
export * from "./progress.js";
export * from "./reviews.js";
export * from "./search.js";
export * from "./watch.js";
export * from "./http.js";
export * from "./achievements.js";
export * from "./comments.js";
export * from "./profile.js";
export * from "./recommendations.js";
export * from "./analytics.js";
export * from "./admin.js";

const DIACRITICS = /[̀-ͯ]/g;
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/** Turn a title into a URL-safe slug used in anime detail routes. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(NON_SLUG, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, 80);
  return slug || "anime";
}
