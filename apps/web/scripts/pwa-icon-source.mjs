// The site's mark: 影 — the same glyph the loading splash, the header
// wordmark and every page watermark already use. It replaces an abstract
// two-circle crescent that shared nothing with the interface it stood for.
//
// Drawn as text rather than as an outline path on purpose: the PNGs below are
// rasterized once on a machine that has a CJK font and committed to public/,
// so nothing at build or run time ever needs that font. The one place the
// glyph is drawn live is favicon.svg, which browsers render with a system CJK
// font — present on Windows, macOS, iOS and Android alike.
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

// Named explicitly, widest-support first, so whichever renderer sees this
// picks a real CJK face instead of falling back to a box.
const CJK_STACK =
  "'Noto Sans CJK JP','Noto Sans JP','Source Han Sans','Yu Gothic','Hiragino Sans','Microsoft YaHei','PingFang SC','SimSun',sans-serif";

/**
 * @param {{ maskable?: boolean }} options
 */
export function markSvg({ maskable }) {
  const rect = maskable
    ? `<rect width="512" height="512" fill="${BG}"/>`
    : `<rect width="512" height="512" rx="128" fill="${BG}"/>`;
  // Smaller on the maskable variant: an OS mask can crop up to 10% off each
  // edge, and a glyph that fills the square would lose its strokes to it.
  const size = maskable ? 300 : 340;
  // `dominant-baseline` is honoured inconsistently by SVG rasterizers, so the
  // baseline is placed by hand: a CJK glyph's ink sits roughly centred on its
  // em box, which puts the visual centre at about 0.36em below the baseline.
  const baseline = 256 + size * 0.372;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${rect}
  <text x="256" y="${baseline}" font-size="${size}" fill="${FG}" text-anchor="middle" font-family="${CJK_STACK}">影</text>
</svg>`;
}
