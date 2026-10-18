import { cn } from "@/lib/utils";
import glyph from "./honkon-glyph.json";

/** Original outline from hon-kon.ru/logos/logo.svg, coloured by the site's theme. */
export function HonkonGlyph({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox={glyph.viewBox}
      fill="none"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <path
        className={animated ? "hk-logo-base" : undefined}
        d={glyph.path}
        stroke="currentColor"
        strokeWidth={glyph.strokeWidth}
        strokeLinecap="round"
      />
      {animated && (
        <path
          className="hk-logo-ink"
          pathLength="1"
          d={glyph.path}
          stroke="currentColor"
          strokeWidth={glyph.strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
