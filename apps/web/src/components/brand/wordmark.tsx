import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogoGlyph } from "./logo-glyph";
import { SlicedGlyph } from "./sliced-glyph";

/**
 * The site's name as a link home. Nothing moves while it is left alone; the
 * mark and the name light up each on its own: pointing at the 影 makes it
 * glow, pointing at the name runs a band of light through the letters (the
 * button sweep, clipped to the text). Keyboard focus lights both.
 *
 * "slice" swaps the mark for SlicedGlyph, which comes apart along diagonal
 * cuts and joins back up.
 */
export function Wordmark({
  size = "md",
  effect = "shine",
  className,
  textClassName,
}: {
  size?: "md" | "lg";
  effect?: "shine" | "slice";
  className?: string;
  /** Sizes the name alone — the mark keeps its size. */
  textClassName?: string;
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
      <span aria-hidden className={cn("wordmark-text", textClassName)}>
        AnimeShadow
      </span>
    </Link>
  );
}
