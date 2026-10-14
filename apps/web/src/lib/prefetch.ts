import type { AnimeStats, WatchResponse } from "@animeshadow/shared";
import { readLocale } from "@/i18n";
import { apiRequest } from "./api";
import { animeQueryOptions, queryClient, queryKeys } from "./query";

/** The title page's code: fetched once, alongside its data. */
let pageChunk: Promise<unknown> | null = null;
function loadPage() {
  pageChunk ??= import("@/routes/anime-detail").catch(() => {
    pageChunk = null;
  });
  return pageChunk;
}

/**
 * Everything a title's page needs, asked for at once and in parallel —
 * the page's code, the title, its players, viewers' marks and frames —
 * instead of one after another as each part renders. Run when the route
 * starts (see router.tsx); the title alone (and the code) already on
 * pointing at a card. Fresh data is never fetched twice.
 */
export function prefetchAnime(param: string, full = true): void {
  if (!param) return;
  void loadPage();
  void queryClient.prefetchQuery(animeQueryOptions(param, readLocale()));
  if (!full) return;
  const id = Number(/^(\d+)/.exec(param)?.[1]);
  if (!Number.isInteger(id) || id <= 0) return;
  void queryClient.prefetchQuery({
    queryKey: queryKeys.watch(id),
    queryFn: ({ signal }) => apiRequest<WatchResponse>(`/anime/${id}/watch`, { signal }),
    staleTime: 15 * 60_000,
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.animeStats(id),
    queryFn: ({ signal }) => apiRequest<{ stats: AnimeStats | null }>(`/anime/${id}/stats`, { signal }).then((r) => r.stats),
    staleTime: 60 * 60_000,
  });
  void queryClient.prefetchQuery({
    queryKey: ["hero-frames", id],
    queryFn: ({ signal }) => apiRequest<{ frames: string[] }>(`/anime/${id}/frames?v=2`, { signal }).then((r) => r.frames),
    staleTime: Infinity,
  });
}

/** For a card: after a short hover (not a pointer passing over), the title and the page's code. */
export function hoverPrefetch(param: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    onPointerEnter: () => {
      timer = setTimeout(() => prefetchAnime(param, false), 90);
    },
    onPointerLeave: () => {
      if (timer) clearTimeout(timer);
    },
    onTouchStart: () => prefetchAnime(param, false),
    onFocus: () => prefetchAnime(param, false),
  };
}
