import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

/**
 * The built app's index.html — the shell every page is. Read from the web
 * build next to the API (apps/web/dist), re-read when a deploy swaps it.
 * Without a build (local development) a bare shell stands in, which is
 * enough to look at what a page renders.
 */
const DIST = env.WEB_DIST_DIR ?? path.resolve(process.cwd(), "../web/dist");
const FILE = path.join(DIST, "index.html");

const FALLBACK = `<!doctype html><html lang="ru" class="dark"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>AnimeShadow</title></head><body><div id="root"></div></body></html>`;

let cached: { mtimeMs: number; html: string; checkedAt: number } | null = null;

export function appShell(): string {
  const now = Date.now();
  if (cached && now - cached.checkedAt < 2_000) return cached.html;
  try {
    const { mtimeMs } = statSync(FILE);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, html: readFileSync(FILE, "utf8"), checkedAt: now };
    } else {
      cached.checkedAt = now;
    }
    return cached.html;
  } catch {
    return FALLBACK;
  }
}

/**
 * The shell with this page's own head and readable content: the language
 * set to Russian, the stock title and description replaced, the page's
 * tags added before </head>, and its content inside #root — which the app
 * replaces with itself as soon as it starts.
 */
export function fillShell(head: string, body: string): string {
  return appShell()
    .replace(/<html[^>]*>/i, '<html lang="ru" class="dark">')
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>/i, "")
    .replace(/<\/head>/i, `${head}\n</head>`)
    .replace(/<div id="root"><\/div>/i, `<div id="root">${body}</div>`);
}
