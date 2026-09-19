import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

interface PosterFallbackProps {
  title: string;
  /** Stable seed (anime / character id) so the same entry always looks the same. */
  seed: number;
  variant?: "poster" | "avatar";
  className?: string;
}

/**
 * A deterministic generated poster for titles with no artwork. Pure CSS — no
 * API, no canvas — so it always renders and costs nothing. The hue is derived
 * from the seed, layered over the theme's card colour, with a large 影 mark and
 * the title set in the display face.
 */
export function PosterFallback({
  title,
  seed,
  variant = "poster",
  className,
}: PosterFallbackProps) {
  const hue = (seed * 47) % 360;
  const hue2 = (hue + 40) % 360;
  const style = {
    "--pf-a": `oklch(0.32 0.09 ${hue})`,
    "--pf-b": `oklch(0.19 0.05 ${hue2})`,
  } as CSSProperties;

  if (variant === "avatar") {
    return (
      <div
        style={style}
        className={cn(
          "flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,var(--pf-a),var(--pf-b))] font-display text-lg text-white/85",
          className,
        )}
      >
        {(title || "?").charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={cn(
        "glow-in relative flex size-full flex-col items-center justify-center overflow-hidden bg-[linear-gradient(150deg,var(--pf-a),var(--pf-b))] p-4 text-center",
        className,
      )}
    >
      {/* big shadow mark */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-6 select-none font-display text-[9rem] leading-none text-white/[0.07]"
      >
        <SlicedGlyph />
      </span>
      {/* faint diagonal texture */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(135deg,#fff_0_1px,transparent_1px_10px)]"
      />
      <span className="relative line-clamp-4 font-display text-sm font-medium leading-tight text-white/90 sm:text-base">
        {title}
      </span>
      <span
        aria-hidden
        className="relative mt-3 h-0.5 w-8 rounded-full"
        style={{ background: `oklch(0.75 0.15 ${hue})` }}
      />
    </div>
  );
}
