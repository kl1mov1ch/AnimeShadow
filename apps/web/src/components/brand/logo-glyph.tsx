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
    <svg viewBox="0 0 1000 1000" aria-hidden className={cn("size-[1.15em] shrink-0", className)} fill="currentColor">
      <path
        transform={`translate(500 500) scale(${s} ${-s}) translate(${-glyph.centerX} ${-glyph.centerY})`}
        d={glyph.d}
      />
    </svg>
  );
}
