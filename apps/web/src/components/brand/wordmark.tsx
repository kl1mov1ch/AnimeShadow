import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogoGlyph } from "./logo-glyph";
import { SlicedGlyph } from "./sliced-glyph";

/**
 * The site's name as a link home. Nothing moves while it is left alone; on
 * hover (or keyboard focus) a band of light runs through the letters — the
 * button sweep, clipped to the text.
 *
 * The 影 either tips slightly ("shine") or comes apart along diagonal cuts
 * and joins back up ("slice", see SlicedGlyph).
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
        className,
      )}
    >
      {effect === "shine" ? (
        <LogoGlyph className={cn("wordmark-glyph text-primary", size === "lg" && "text-2xl")} />
      ) : (
        <SlicedGlyph className={cn("text-[1.15em] text-primary", size === "lg" && "text-[1.7em]")} />
      )}
      <span aria-hidden className="wordmark-text">
        AnimeShadow
      </span>
    </Link>
  );
}
