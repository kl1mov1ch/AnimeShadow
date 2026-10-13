import { cn } from "@/lib/utils";
import { LogoGlyph } from "./logo-glyph";

/**
 * The site's 影, large and barely there, behind a block's content — a
 * signature on the panels that are the site's own (not another row of
 * posters). The parent needs `relative overflow-hidden` (and `isolate`, so
 * the mark stays under its content); place and size it with `className`.
 */
export function LogoWatermark({ className }: { className?: string }) {
  return (
    <LogoGlyph
      className={cn(
        "logo-wm pointer-events-none absolute -z-10 size-64 select-none text-foreground/[0.04]",
        className,
      )}
    />
  );
}
