import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Horizontal bands for the slice effect, top to bottom, and how far each drifts. */
const SLICES = [
  { top: 0, bottom: 80, dx: -5 },
  { top: 20, bottom: 60, dx: 7 },
  { top: 40, bottom: 40, dx: -9 },
  { top: 60, bottom: 20, dx: 6 },
  { top: 80, bottom: 0, dx: -4 },
];

function Mark({ size, shine }: { size: "md" | "lg"; shine: boolean }) {
  return (
    <>
      <span aria-hidden className={cn("wordmark-glyph text-primary", size === "lg" && "text-2xl")}>
        影
      </span>
      <span aria-hidden className={shine ? "wordmark-text" : "text-foreground"}>
        AnimeShadow
      </span>
    </>
  );
}

/**
 * The site's name as a link home. Nothing moves while it is left alone.
 *
 * "shine": on hover a band of light runs through the letters — the button
 * sweep, clipped to the text — and the 影 tips slightly.
 *
 * "slice": on hover the mark comes apart into horizontal strips that slide
 * sideways and fade, then snap back together. Done with stacked copies, each
 * clipped to one strip; at rest the copies are invisible and only the plain
 * mark shows.
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
  const layout = cn("inline-flex items-center", size === "lg" ? "gap-2" : "gap-1.5");
  return (
    <Link
      to="/"
      aria-label="AnimeShadow"
      className={cn(
        "wordmark group inline-flex shrink-0 items-center font-display text-lg tracking-tight outline-none",
        effect === "slice" && "wordmark--slice",
        className,
      )}
    >
      {effect === "shine" ? (
        <span className={layout}>
          <Mark size={size} shine />
        </span>
      ) : (
        <span className="relative inline-flex">
          <span className={cn("wordmark-base", layout)}>
            <Mark size={size} shine={false} />
          </span>
          {SLICES.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className={cn("wordmark-slice", layout)}
              style={
                {
                  clipPath: `inset(${s.top}% 0 ${s.bottom}% 0)`,
                  "--dx": `${s.dx}px`,
                  animationDelay: `${i * 18}ms`,
                } as CSSProperties
              }
            >
              <Mark size={size} shine={false} />
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}
