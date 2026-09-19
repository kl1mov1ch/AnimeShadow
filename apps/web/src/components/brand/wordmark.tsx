import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import glyph from "./logo-glyph.json";

/**
 * 影 as a drawn outline, the same one favicon.svg and the app icons use —
 * so the mark is equally bold on every system instead of depending on
 * whichever CJK font happens to be installed. Sized in em, coloured by
 * `currentColor`, like a letter.
 */
export function LogoGlyph({ className }: { className?: string }) {
  const s = 960 / Math.max(glyph.width, glyph.height);
  return (
    <svg viewBox="0 0 1000 1000" aria-hidden className={cn("size-[1.15em]", className)} fill="currentColor">
      <path
        transform={`translate(500 500) scale(${s} ${-s}) translate(${-glyph.centerX} ${-glyph.centerY})`}
        d={glyph.d}
      />
    </svg>
  );
}

/**
 * Diagonal bands for the slice effect. Each is the strip between two
 * parallel cuts that drop 25% from left to right, so together they cover
 * the square corner to corner. Each drifts along its own cut.
 */
const SLICES = [0, 25, 50, 75, 100].map((top, i) => {
  const bottom = top + 25;
  const dx = [-6, 8, -9, 7, -5][i]!;
  return {
    clip: `polygon(0% ${top}%, 100% ${top - 25}%, 100% ${bottom - 25}%, 0% ${bottom}%)`,
    dx,
    dy: -dx * 0.25,
  };
});

/**
 * The site's name as a link home. Nothing moves while it is left alone; on
 * hover (or keyboard focus) a band of light runs through the letters — the
 * button sweep, clipped to the text.
 *
 * The 影 either tips slightly ("shine"), or ("slice") comes apart along
 * diagonal cuts, its pieces sliding and fading, then joins back up. The
 * slice is stacked copies of the glyph, each clipped to one band; at rest
 * they are invisible and only the whole glyph shows.
 */
export function Wordmark({
  size = "md",
  effect = "shine",
  className,
}: {
  size?: "md" | "lg";
  effect?: "shine" | "slice";
  className?: string;
}) {
  return (
    <Link
      to="/"
      aria-label="AnimeShadow"
      className={cn(
        "wordmark group inline-flex shrink-0 items-center font-display text-lg tracking-tight outline-none",
        size === "lg" ? "gap-2" : "gap-1.5",
        effect === "slice" && "wordmark--slice",
        className,
      )}
    >
      {effect === "shine" ? (
        <LogoGlyph className={cn("wordmark-glyph text-primary", size === "lg" && "text-2xl")} />
      ) : (
        <span className={cn("relative inline-flex text-primary", size === "lg" && "text-2xl")}>
          <LogoGlyph className="wordmark-base" />
          {SLICES.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="wordmark-slice"
              style={
                {
                  clipPath: s.clip,
                  "--dx": `${s.dx}px`,
                  "--dy": `${s.dy}px`,
                  animationDelay: `${i * 18}ms`,
                } as CSSProperties
              }
            >
              <LogoGlyph />
            </span>
          ))}
        </span>
      )}
      <span aria-hidden className="wordmark-text">
        AnimeShadow
      </span>
    </Link>
  );
}
