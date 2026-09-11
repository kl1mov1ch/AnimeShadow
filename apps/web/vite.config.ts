import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";

// Single source of truth: the repo-root .env.
const envDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const apiUrl = env.VITE_API_URL || "http://localhost:4000";

  return {
    plugins: [react(), tailwindcss()],
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
