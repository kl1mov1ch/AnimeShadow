/** Dispatched on `window` to open the full search window (the ⌘K palette) —
 *  from the header's search button on a phone, where there is no room for
 *  an input in the bar. */
export const OPEN_SEARCH_EVENT = "animeshadow:open-search";
export const SEARCH_STATE_EVENT = "animeshadow:search-state";

export type GlobalSearchMode = "anime" | "people" | "collections";
export interface GlobalSearchRequest {
  mode?: GlobalSearchMode;
  query?: string;
}

/** Every page opens the same palette; only its initial tab/query differ. */
export function openGlobalSearch(request: GlobalSearchRequest = {}): void {
  window.dispatchEvent(
    new CustomEvent<GlobalSearchRequest>(OPEN_SEARCH_EVENT, { detail: request }),
  );
}

export function normalizeSearchRequest(value: unknown): GlobalSearchRequest {
  if (!value || typeof value !== "object") return { mode: "anime", query: "" };
  const request = value as GlobalSearchRequest;
  return {
    mode:
      request.mode === "people" || request.mode === "collections"
        ? request.mode
        : "anime",
    query: typeof request.query === "string" ? request.query.slice(0, 200) : "",
  };
}
