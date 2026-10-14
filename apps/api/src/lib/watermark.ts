import sharp from "sharp";

const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/**
 * The site's mark burned into a frame: "AnimeShadow" with the address in
 * the bottom-right corner (shadowed, readable on any picture), and the name
 * once more, large and faint, across the middle — cropping the corner off
 * doesn't take the mark with it. Latin only: a server font for the 影 glyph
 * can't be counted on.
 */
export async function watermark(input: Buffer): Promise<Buffer> {
  const img = sharp(input, { failOn: "none" });
  const meta = await img.metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 720;
  const big = Math.round(w * 0.034);
  const small = Math.round(w * 0.018);
  const pad = Math.round(w * 0.022);
  const font = "DejaVu Sans, Arial, Helvetica, sans-serif";
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${Math.max(1, Math.round(w / 640))}" stdDeviation="${Math.max(1, Math.round(w / 480))}" flood-color="#000" flood-opacity="0.75"/></filter></defs>
  <g font-family="${font}" text-anchor="end" filter="url(#s)">
    <text x="${w - pad}" y="${h - pad - small * 1.25}" font-size="${big}" font-weight="700" fill="#ffffff" fill-opacity="0.82">${escape("AnimeShadow")}</text>
    <text x="${w - pad}" y="${h - pad}" font-size="${small}" fill="#ff5c8a" fill-opacity="0.9">${escape("animeshadow.online")}</text>
  </g>
  <text x="${w / 2}" y="${h / 2}" font-family="${font}" font-size="${Math.round(w * 0.09)}" font-weight="800" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" fill-opacity="0.07" transform="rotate(-18 ${w / 2} ${h / 2})">AnimeShadow</text>
</svg>`;
  return img
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}
