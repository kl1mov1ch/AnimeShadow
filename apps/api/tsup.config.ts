import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Workspace packages are built to their own dist/ and resolved at runtime.
  external: [/^@animeshadow\//],
  skipNodeModulesBundle: true,
});
