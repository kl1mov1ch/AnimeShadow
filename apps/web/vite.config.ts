import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Single source of truth: the repo-root .env.
const envDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const apiUrl = env.VITE_API_URL || "http://localhost:4000";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Self-heals silently on the next navigation rather than sitting on
        // a stale bundle until the viewer manually refreshes — the same
        // instinct as the vite:preloadError reload in main.tsx, just for the
        // service worker itself.
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["favicon.svg"],
        manifest: {
          id: "/",
          name: "AnimeShadow",
          short_name: "AnimeShadow",
          description:
            "AnimeShadow — a screening-room catalogue of anime. Discover what's airing, dig into any title, and keep your own watch list.",
          lang: "ru",
          start_url: "/",
          scope: "/",
          display: "standalone",
          // Matches the existing <meta name="theme-color"> in index.html —
          // the installed app's title/status bar and its splash screen (on
          // Android, built from these three fields plus the 512 icon) stay
          // the same dark shade the site already opens on, not a flash of
          // browser-default white before the app itself paints.
          theme_color: "#0a0b10",
          background_color: "#0a0b10",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/maskable-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // The SPA shell for any route the viewer already has cached — so
          // reopening the installed app offline lands back on the last page
          // instead of the browser's own "no internet" screen. API/upload
          // requests are excluded: those are fetch() calls the app code
          // handles itself (see runtimeCaching below), not navigations.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            // Player sources change (a mirror dies, a new dub appears) and a
            // stale one sends the viewer to a dead embed, so this is the one
            // catalogue read that must always go to the network. Registered
            // before the rule below because Workbox takes the first match.
            {
              urlPattern: /\/api\/anime\/[^/]+\/watch/,
              handler: "NetworkOnly",
            },
            // The catalogue itself: homepage rails, browse pages, title pages,
            // genre lists, search. Stale-while-revalidate is exactly the right
            // shape — this data changes slowly, and on a weak connection
            // showing last visit's copy instantly while a fresh one loads
            // behind it is the difference between a usable site and a
            // spinner. Nothing here is account-specific, so a shared cache is
            // safe.
            {
              urlPattern: /\/api\/(discover|genres|search|anime)(\/|\?|$)/,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "catalogue",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 3 },
                cacheableResponse: { statuses: [200] },
              },
            },
            // The account's own data — profile, library, progress — is
            // exactly what "offline bookmarks" means here: there's no
            // player without a network, but the list of what's tracked and
            // how far into it the viewer got should still open. Network
            // first (never show week-old data when a connection exists),
            // falling back to whatever was last cached when it doesn't.
            {
              urlPattern: /\/api\/(me\/profile|me\/progress|library)(\?.*)?$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "user-data",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            // Posters/screenshots/avatars — all proxied same-origin through
            // /api/img (see lib/format.ts) or served from /uploads. These
            // almost never change once fetched, so cache-first is safe and
            // is what makes a previously-viewed title's art still show up
            // with no connection.
            {
              urlPattern: /\/api\/img\?/,
              handler: "CacheFirst",
              options: {
                cacheName: "anime-images",
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /\/uploads\//,
              handler: "CacheFirst",
              options: {
                cacheName: "user-uploads",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            // The two Google Fonts requests index.html already preconnects
            // for — Workbox's own recipe for this exact pair.
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-stylesheets" },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        devOptions: {
          // Off by default — a service worker intercepting every request
          // during `pnpm dev` would fight Vite's own HMR far more often
          // than it'd actually help test offline behaviour. Flip to true
          // locally when that's specifically what's being tested.
          enabled: false,
        },
      }),
    ],
    envDir,
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      // Never let a dependency pull in its own copy of React.
      dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react-router",
        "react-router/dom",
        "react-router-dom",
        "@tanstack/react-query",
        "next-themes",
        "fuse.js",
      ],
    },
    server: {
      port: 5173,
      // Proxy /api during dev so the browser talks to one origin (no CORS dance).
      proxy: {
        "/api": { target: apiUrl, changeOrigin: true },
        "/uploads": { target: apiUrl, changeOrigin: true },
      },
    },
    preview: { port: 5173 },
    build: {
      target: "es2022",
      sourcemap: true,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Split big, rarely-changing vendors so app edits don't bust their cache.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              /[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router|history|use-sync-external-store)[\\/]/.test(
                id,
              )
            ) {
              return "vendor-react";
            }
            if (id.includes("@tanstack") || id.includes("fuse.js")) {
              return "vendor-query";
            }
            if (/[\\/](radix-ui|@radix-ui|cmdk|sonner|vaul|next-themes|aria-hidden|react-remove-scroll)[\\/]/.test(id)) {
              return "vendor-ui";
            }
            if (id.includes("lucide-react")) return "vendor-icons";
            // Everything else: let Rollup co-locate with its importer.
            return undefined;
          },
        },
      },
    },
  };
});
