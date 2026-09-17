#!/usr/bin/env node
// Rasterizes the site mark (see pwa-icon-source.mjs) into the PNGs the web
// app manifest and iOS need. Run manually whenever the mark changes —
// `node scripts/generate-pwa-icons.mjs` from apps/web. Output is checked
// into public/, so this never runs as part of a normal build.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { markSvg } from "./pwa-icon-source.mjs";

const outDir = fileURLToPath(new URL("../public/icons", import.meta.url));
await mkdir(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-icon-512.png", size: 512, maskable: true },
  // iOS ignores manifest icons entirely — it wants its own link rel tag,
  // and prefers a full-bleed square (it applies its own corner rounding).
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

for (const { file, size, maskable } of targets) {
  const svg = Buffer.from(markSvg({ maskable }));
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(`${outDir}/${file}`, png);
  console.log(`wrote icons/${file} (${size}x${size}${maskable ? ", maskable" : ""})`);
}
