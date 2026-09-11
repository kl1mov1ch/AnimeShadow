// Prisma emits the client into src/generated (so `tsx` dev works from source).
// The compiled build in dist/ imports it with a relative path, so mirror the
// generated client into dist/generated after tsc runs.
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const from = new URL("../src/generated", import.meta.url);
const to = new URL("../dist/generated", import.meta.url);

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });

console.log(`[db] copied generated client into dist/ (${root})`);
