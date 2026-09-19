import { readFileSync } from "node:fs";

// The site's mark: 影 — the same glyph the loading splash, the header
// wordmark and every page watermark already use. It replaces an abstract
// two-circle crescent that shared nothing with the interface it stood for.
//
// Two variants:
//
// - `any`: the mark on its rounded-square background, for wherever the
//   browser or OS will not reshape the icon itself.
// - `maskable`: the same mark on a plain edge-to-edge square (no rx), so an
//   OS-applied mask (circle, squircle, teardrop…) has full-bleed background
//   to cut into rather than clipping our own rounding against its own. The
//   glyph is sized to stay well inside the standard 80%-diameter safe circle.
const BG = "#0a0b10";
const FG = "#ff4d6d";

// The mark's outline, shared with the header and favicon.svg — a path, so the
// icons are the same bold glyph as the site no matter what fonts the machine
// running this has. Outline from Noto Sans JP, weight 800 (SIL OFL 1.1).
const glyph = JSON.parse(
  readFileSync(new URL("../src/components/brand/logo-glyph.json", import.meta.url), "utf-8"),
);

/**
 * @param {{ maskable?: boolean }} options
 */
export function markSvg({ maskable }) {
  const rect = maskable
    ? `<rect width="512" height="512" fill="${BG}"/>`
    : `<rect width="512" height="512" rx="128" fill="${BG}"/>`;
  // Smaller on the maskable variant: an OS mask can crop up to 10% off each
  // edge, and a glyph that fills the square would lose its strokes to it.
  const size = maskable ? 300 : 350;
  const s = size / Math.max(glyph.width, glyph.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${rect}
  <path fill="${FG}" transform="translate(256 256) scale(${s} ${-s}) translate(${-glyph.centerX} ${-glyph.centerY})" d="${glyph.d}"/>
</svg>`;
}
