import { lazy, Suspense, useEffect, useState } from "react";

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // `event.code`, not `event.key`: code names the physical key, so this
      // matches whatever the active keyboard layout puts there. On a Russian
      // layout that key reports `event.key === "л"`, so a `key === "k"` test
      // simply never fired — and because it never fired, preventDefault never
      // ran either and the browser's own Ctrl+K (focus the address bar) won
      // by default. `key` stays as a fallback for anything not reporting a
      // code at all.
      const isK = event.code === "KeyK" || event.key.toLowerCase() === "k";
      if (!isK || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setLoaded(true);
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded) return null;

  return (
    <Suspense fallback={null}>
      <SearchCommandDialog open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
