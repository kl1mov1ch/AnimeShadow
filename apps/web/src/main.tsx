import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ThemeSync } from "@/components/theme-sync";
import { AuthProvider } from "@/hooks/use-auth";
import { I18nProvider } from "@/i18n";
import { queryClient } from "@/lib/query";
import { router } from "@/router";

// A view transition that another navigation cut short rejects its promise
// with an AbortError nobody awaits — clicking two links quickly is enough.
// It means "the newer page won", which is exactly right, so it is not
// reported as an uncaught error. Anything else still is.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { name?: string; message?: string } | undefined;
  if (reason?.name === "AbortError" && /transition/i.test(reason.message ?? "")) {
    event.preventDefault();
  }
});
// The fonts, served from our own origin with the rest of the build. Each
// family is split by script (unicode-range), so a page downloads only the
// Cyrillic and Latin files it actually draws.
import "@fontsource-variable/onest";
import "@fontsource-variable/unbounded";
import "@fontsource/russo-one/cyrillic-400.css";
import "@fontsource/russo-one/latin-400.css";
import "@/index.css";
import { FEATURES } from "@/lib/features";

// A deploy replaces every built asset with a freshly-hashed filename — a tab
// left open across that moment still has the *old* index.html in memory, so
// its next route-level lazy import points at a chunk that no longer exists
// on the server. Vite recognizes exactly this and fires `vite:preloadError`
// instead of letting it surface as a bare fetch failure; reloading once
// fetches the new index.html (and therefore the right chunk hashes) and the
// visitor never sees anything went wrong at all.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

// The installed app (the service worker) keeps the last version it saw and
// serves it, offline-first — so after a deploy, people kept seeing the old
// site until they happened to hard-reload. Now: the worker is asked about a
// new version on every open and every half hour, and the moment a new one
// takes over, the page reloads into it once. Not on a first visit — there
// was no old version then, only the first install.
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  void navigator.serviceWorker.ready.then((registration) => {
    const check = () => void registration.update().catch(() => undefined);
    check();
    window.setInterval(check, 30 * 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  });
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        // Dark only while the light theme is switched off (lib/features):
        // forced, so a theme saved earlier in the browser can't bring it back.
        forcedTheme={FEATURES.lightTheme ? undefined : "dark"}
        enableSystem={FEATURES.lightTheme}
        disableTransitionOnChange
      >
        <I18nProvider>
          <AuthProvider>
            {/* Syncing the account's theme fetched the profile on every
                page; with one theme there is nothing to sync. */}
            {FEATURES.lightTheme && <ThemeSync />}
            <RouterProvider router={router} />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
