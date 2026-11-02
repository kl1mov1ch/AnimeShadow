import { lazy, Suspense, useEffect, useState } from "react";
import {
  normalizeSearchRequest,
  OPEN_SEARCH_EVENT,
  SEARCH_STATE_EVENT,
  type GlobalSearchRequest,
} from "@/lib/search-events";

/**
 * Owns the ⌘K shortcut; loads the palette itself only once it is asked for.
 *
 * The palette pulls in cmdk, the dialog primitive and the shared result rows.
 * Mounted eagerly, all of that sat in the entry chunk of every page load, for
 * a surface most visits never open — which on a weak phone is parse time
 * spent on nothing. This file is a keydown listener and nothing else until
 * the first press.
 */
const SearchCommandDialog = lazy(() =>
  import("./search-command-dialog").then((m) => ({
    default: m.SearchCommandDialog,
  })),
);

export function SearchCommandMount() {
  // Sticks at true after the first press: once loaded there is no reason to
  // unload it, and re-importing on every close would be worse than useless.
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<GlobalSearchRequest & { id: number }>({
    id: 0,
    mode: "anime",
    query: "",
  });
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SEARCH_STATE_EVENT, { detail: open }));
    return () => {
      if (open)
        window.dispatchEvent(new CustomEvent(SEARCH_STATE_EVENT, { detail: false }));
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // `event.code`, not `event.key`: code names the physical key, so this
      // matches whatever the active keyboard layout puts there. On a Russian
      // layout that key reports `event.key === "л"`, so a `key === "k"` test
      // simply never fired — and because it never fired, preventDefault never
      // ran either and the browser's own Ctrl+K (focus the address bar) won
      // by default. `key` stays as a fallback for anything not reporting a
      // code at all — and neither is guaranteed: a browser filling in a saved
      // login fires keydown events with no `key` at all, which is exactly
      // what used to throw here on the sign-in page.
      const isK = event.code === "KeyK" || event.key?.toLowerCase() === "k";
      if (!isK || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setRequest((previous) => ({ id: previous.id + 1, mode: "anime", query: "" }));
      setLoaded(true);
      setOpen((wasOpen) => !wasOpen);
    };
    // The header's search button on a phone.
    const onOpen = (event: Event) => {
      const next = normalizeSearchRequest(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      setRequest((previous) => ({ ...next, id: previous.id + 1 }));
      setLoaded(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  if (!loaded) return null;

  return (
    <Suspense fallback={null}>
      <SearchCommandDialog
        key={request.id}
        open={open}
        onOpenChange={setOpen}
        request={request}
      />
    </Suspense>
  );
}
