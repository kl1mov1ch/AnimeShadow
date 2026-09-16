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
import "@/index.css";

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

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <I18nProvider>
          <AuthProvider>
            <ThemeSync />
            <RouterProvider router={router} />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
