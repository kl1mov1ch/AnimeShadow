import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ArtGlowProps {
  /** Image whose colour bleeds outward behind the content. */
  src: string | null;
  className?: string;
  children: ReactNode;
  /** Turn the glow off (e.g. reduced-data or a placeholder). */
  disabled?: boolean;
}

/**
 * Wraps content so the referenced artwork appears to cast coloured light onto
 * the surface behind it — the "shadow" AnimeShadow is named for. Used sparingly:
 * the spotlight and the detail header, not every card.
 */
export function ArtGlow({ src, className, children, disabled }: ArtGlowProps) {
  const showGlow = Boolean(src) && !disabled;
  return (
    <div
      className={cn("relative isolate", showGlow && "art-glow", className)}
      style={
        showGlow
          ? ({ "--glow-image": `url(${src})` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
