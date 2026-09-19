import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * The site's name as a link home. On hover (or keyboard focus) a band of
 * light runs through the letters themselves — the same sweep the buttons
 * have, clipped to the text instead of drawn over a surface — and the 影
 * tips slightly. Nothing moves while it is left alone.
 */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      to="/"
      aria-label="AnimeShadow"
      className={cn(
        "wordmark group inline-flex shrink-0 items-center font-display tracking-tight outline-none",
        size === "lg" ? "gap-2 text-lg" : "gap-1.5 text-lg",
        className,
      )}
    >
      <span aria-hidden className={cn("wordmark-glyph text-primary", size === "lg" && "text-2xl")}>
        影
      </span>
      <span aria-hidden className="wordmark-text">
        AnimeShadow
      </span>
    </Link>
  );
}
