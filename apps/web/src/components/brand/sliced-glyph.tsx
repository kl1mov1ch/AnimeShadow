import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { LogoGlyph } from "./logo-glyph";

/**
 * Diagonal bands: each the strip between two parallel cuts that drop 25%
 * from left to right, together covering the square corner to corner. Each
 * piece drifts along its own cut; distances are in em, so a watermark ten
 * times the size of the header mark comes apart in proportion.
 */
const SLICES = [0, 25, 50, 75, 100].map((top, i) => {
  const dx = [-0.29, 0.38, -0.43, 0.33, -0.24][i]!;
  return {
    clip: `polygon(0% ${top}%, 100% ${top - 25}%, 100% ${top}%, 0% ${top + 25}%)`,
    dx,
    dy: -dx * 0.25,
  };
});

/**
 * The 影 mark, able to come apart along diagonal cuts and join back up.
 *
 * Stacked copies of the glyph, each clipped to one band — invisible at rest,
 * so what shows is the plain glyph. The cut plays once when the glyph, its
 * parent or grandparent, a Tailwind `group`, or anything marked
 * `data-glyph-host` is hovered — which is what lets a watermark that takes
 * no pointer events of its own still answer to the card it sits in.
 * `loop` repeats it slowly instead, for the loading screen.
 *
 * Sized at 1em and coloured by currentColor, so it drops in wherever the
 * glyph used to be a text character.
 */
export function SlicedGlyph({ className, loop = false }: { className?: string; loop?: boolean }) {
  return (
    <span aria-hidden className={cn("sliced-glyph", loop && "sliced-glyph--loop", className)}>
      <LogoGlyph className="sliced-glyph-base size-[1em]" />
      {SLICES.map((s, i) => (
        <span
          key={i}
          className="sliced-glyph-piece"
          style={
            {
              clipPath: s.clip,
              "--dx": `${s.dx}em`,
              "--dy": `${s.dy}em`,
              animationDelay: `${i * 18}ms`,
            } as CSSProperties
          }
        >
          <LogoGlyph className="size-[1em]" />
        </span>
      ))}
    </span>
  );
}
