// Prisma emits the client into src/generated (so `tsx` dev works from source).
// The compiled build in dist/ imports it with a relative path, so mirror the
// generated client into dist/generated after tsc runs.
//
// Copied file by file, over the top, rather than wiping the directory first.
// On Windows the query-engine .node binary is held open by any running process
// that has loaded Prisma — a dev server, usually — and a recursive delete dies
// on it with EPERM. That used to abort the whole script, leaving dist/generated
// containing nothing but the locked binary: no index.d.ts, so `@animeshadow/db`
// exported no PrismaClient, so every service that imports it lost its types.
// A build failing is fine; a build leaving a half-copied package behind is not.
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../src/generated", import.meta.url));
const to = fileURLToPath(new URL("../dist/generated", import.meta.url));

let copied = 0;
const locked = [];

async function mirror(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src)) {
    const source = join(src, name);
    const target = join(dest, name);
    if ((await stat(source)).isDirectory()) {
      await mirror(source, target);
      continue;
    }
    try {
      await cp(source, target, { force: true });
      copied += 1;
    } catch (error) {
      // The native engine is the only file that is ever locked, and it is
      // byte-identical to the copy already sitting there unless Prisma itself
      // was upgraded — so keeping the existing one is correct, not a fudge.
      if (error?.code === "EPERM" || error?.code === "EBUSY") {
        locked.push(name);
        continue;
      }
      throw error;
    }
  }
}

await mirror(from, to);

if (locked.length > 0) {
  console.warn(
    `[db] kept ${locked.length} locked file(s) already in dist/: ${locked.join(", ")}` +
      " — stop anything running Prisma (usually `pnpm dev`) if you need them replaced",
  );
}
console.log(`[db] copied ${copied} generated file(s) into dist/`);
