import { useEffect } from "react";

const SITE =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

interface HeadOptions {
  title: string;
  description?: string;
  image?: string | null;
  /** Canonical path, e.g. "/anime/naruto". Defaults to the current path. */
  path?: string;
  /** A Schema.org object serialised into a JSON-LD <script>. */
  jsonLd?: Record<string, unknown>;
  /** Keep the page out of search results. */
  noindex?: boolean;
  type?: "website" | "article" | "video.tv_show";
}

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Dependency-free document head control. Sets <title>, description, canonical,
 * Open Graph + Twitter tags and an optional JSON-LD block — enough for social
 * scrapers and for a prerender pass to snapshot. Cleans the JSON-LD up on
 * unmount so stale structured data never leaks onto another page.
 */
export function useDocumentHead(opts: HeadOptions): void {
  const { title, description, image, path, jsonLd, type = "website", noindex = false } = opts;

  useEffect(() => {
    // The first page of a visit arrives with its head already rendered by the
    // server (title, description, canonical, structured data) — the version
    // search engines index. Leave it exactly as it is; the app takes the head
    // over from the first navigation on (see releaseServerHead).
    if (serverHeadIsCurrent()) return;
    const prevTitle = document.title;
    document.title = title;

    const url = `${SITE}${path ?? window.location.pathname}`;
    setLink("canonical", url);
    if (description) setMeta("name", "description", description);

    setMeta("property", "og:title", title);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", url);
    setMeta("property", "og:site_name", "AnimeShadow");
    if (description) setMeta("property", "og:description", description);
    if (image) setMeta("property", "og:image", image);

    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
    setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    if (description) setMeta("name", "twitter:description", description);
    if (image) setMeta("name", "twitter:image", image);

    let ld: HTMLScriptElement | null = null;
    if (jsonLd) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.textContent = JSON.stringify(jsonLd);
      ld.dataset.seo = "1";
      document.head.appendChild(ld);
    }

    return () => {
      document.title = prevTitle;
      ld?.remove();
    };
  }, [title, description, image, path, type, jsonLd, noindex]);
}

/** The server rendered the head for exactly this address (first page of the visit). */
function serverHeadIsCurrent(): boolean {
  const marker = document.head.querySelector<HTMLMetaElement>('meta[name="seo-path"]');
  return marker != null && marker.content === window.location.pathname + window.location.search;
}

/**
 * Called on the first in-app navigation: the server's head belonged to the
 * page the visit started on, so its structured data and marker go, and the
 * pages' own useDocumentHead take over.
 */
export function releaseServerHead(): void {
  document.head.querySelectorAll('[data-seo-ssr], meta[name="seo-path"]').forEach((el) => el.remove());
}

/** Canonical, slug-based URL for an anime. */
export function animeUrl(anime: { slug: string }): string {
  return `/anime/${anime.slug}`;
}

export { SITE as SITE_URL };
