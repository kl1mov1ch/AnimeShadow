import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api";

/**
 * The site's own reaction gifs (small WebP files kept by the API, cached by
 * the browser for a year). The list of them is kept in this browser too,
 * so on a return visit a gif is chosen before any request is made.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const KEY = "as:gifs.v1";
const SEED_KEY = "as:gifs.seed";

type Library = Record<string, string[]>;

function stored(): Library | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { categories?: Library } | null;
    return raw?.categories && Object.keys(raw.categories).length > 0 ? raw.categories : undefined;
  } catch {
    return undefined;
  }
}

/** One number per visit: the same category shows the same gif on every page of it (already cached), a new visit brings others. */
function seed(): number {
  try {
    const have = sessionStorage.getItem(SEED_KEY);
    if (have) return Number(have);
    const next = Math.floor(Math.random() * 1000);
    sessionStorage.setItem(SEED_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}
const SEED = typeof window === "undefined" ? 0 : seed();

export function useGifLibrary() {
  return useQuery({
    queryKey: ["gif-library"],
    queryFn: async ({ signal }) => {
      const r = await apiRequest<{ categories: Library }>("/gifs", { signal });
      try {
        if (Object.keys(r.categories).length > 0) localStorage.setItem(KEY, JSON.stringify({ categories: r.categories }));
      } catch {
        // No storage — fetched again next visit.
      }
      return r.categories;
    },
    initialData: stored,
    // A stored list answers at once; it is refreshed in the background.
    initialDataUpdatedAt: 0,
    staleTime: 60 * 60_000,
  });
}

/** This visit's gif for a category, from the library — or null if it has none. */
export function pickGif(library: Library | undefined, category: string): string | null {
  const files = library?.[category];
  if (!files || files.length === 0) return null;
  let h = SEED;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${API_BASE}/api/gifs/${files[h % files.length]}`;
}

/** The categories the pages use most — fetched while the browser is idle. */
const WARM = ["wave", "happy"];

export function warmGifs(library: Library | undefined): void {
  if (!library || typeof window === "undefined") return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const run = () => {
    for (const cat of WARM) {
      const url = pickGif(library, cat);
      if (!url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else window.setTimeout(run, 2500);
}
