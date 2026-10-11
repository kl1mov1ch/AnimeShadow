/**
 * The email and code a mailed link carries. Mail now puts them after the
 * `#` — a fragment is never sent to a server, so the code does not reach
 * the analytics scripts with the page address; links mailed before that
 * still carry them as `?email=&code=`, which is read too.
 */
export function linkParam(name: "email" | "code"): string | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get(name) ?? new URLSearchParams(window.location.search).get(name);
}

/** Takes them out of the address bar once read, so they don't stay in
 *  the browser's history or get copied along with the address. */
export function clearLinkParams(): void {
  const url = new URL(window.location.href);
  const hadQuery = url.searchParams.has("code") || url.searchParams.has("email");
  if (!url.hash && !hadQuery) return;
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("email");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}
