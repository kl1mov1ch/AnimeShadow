import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import sharp from "../apps/api/node_modules/sharp/dist/index.mjs";
const require = createRequire(import.meta.url);
const qrFactory = require("../node_modules/.pnpm/qrcode-generator@1.5.2/node_modules/qrcode-generator/qrcode.js");
const fox = JSON.parse(await readFile(new URL("../apps/web/src/components/brand/honkon-glyph.json", import.meta.url), "utf8"));
const site = JSON.parse(await readFile(new URL("../apps/web/src/components/brand/logo-glyph.json", import.meta.url), "utf8"));
const scale = 330 / Math.max(site.width, site.height);
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="220" fill="#e11d48"/><path d="${fox.path}" stroke="white" fill="none" stroke-width="${fox.strokeWidth}" stroke-linecap="round" transform="translate(65 240) scale(.175)"/><text x="535" y="535" fill="#ffffffa0" font-size="75" text-anchor="middle" font-family="sans-serif">×</text><path fill="white" transform="translate(755 500) scale(${scale} ${-scale}) translate(${-site.centerX} ${-site.centerY})" d="${site.d}"/></svg>`;
const root = new URL("../docs/prototypes/", import.meta.url);
await mkdir(root, { recursive: true });
await writeFile(new URL("../apps/web/public/studios/hon-kon/collab-badge.svg", import.meta.url), badge);
for (const [name, suffix] of [["hon-kon", ""], ["hon-kon-releases", "/releases"]]) {
  const qr = qrFactory(0, "H");
  qr.addData(`https://animeshadow.online/studio/hon-kon${suffix}`);
  qr.make();
  const count = qr.getModuleCount(); const size = (count + 8) * 12;
  let blocks = "";
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) blocks += `<rect x="${(x + 4) * 12}" y="${(y + 4) * 12}" width="12" height="12"/>`;
  const bw = Math.floor(size * .215); const p = (size - bw) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="white"/><g fill="#242331">${blocks}</g><rect x="${p - 8}" y="${p - 8}" width="${bw + 16}" height="${bw + 16}" rx="18" fill="white"/><svg x="${p}" y="${p}" width="${bw}" height="${bw}" viewBox="0 0 1000 1000">${badge.replace(/^.*?<svg[^>]*>|<\/svg>$/g, "")}</svg></svg>`;
  await writeFile(new URL(`${name}-qr.svg`, root), svg);
  await sharp(Buffer.from(svg)).png().toFile(new URL(`${name}-qr.png`, root).pathname.replace(/^\/(\w:)/, "$1"));
}
console.log("Created two public QR codes with a co-branded center badge.");
