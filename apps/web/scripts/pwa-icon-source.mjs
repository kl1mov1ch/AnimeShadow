// The site's own favicon mark (see public/favicon.svg), scaled 16x to a
// 512x512 canvas for PWA icon rasterization. Two variants:
//
// - `any`: the mark on its rounded-square background, used wherever the
//   browser/OS won't reshape the icon itself (regular tab favicon parity,
//   apple-touch-icon on older iOS that doesn't apply its own mask).
// - `maskable`: the same mark on a plain edge-to-edge square (no rx) so an
//   OS-applied mask (circle, squircle, teardrop…) has full-bleed background
//   to work with instead of clipping a corner of our own rounding against
//   its own. The mark itself already sits well inside the safe zone at this
//   scale (its farthest point is ~11/32 of the canvas from center, inside
//   the standard 80%-diameter safe circle), so no extra padding is needed.
const BG = "#0a0b10";
const FG = "#ff4d6d";

export function markSvg({ maskable }) {
  const rect = maskable
    ? `<rect width="512" height="512" fill="${BG}"/>`
    : `<rect width="512" height="512" rx="128" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${rect}
  <circle cx="208" cy="256" r="128" fill="${FG}"/>
  <circle cx="288" cy="224" r="112" fill="${BG}"/>
</svg>`;
}
