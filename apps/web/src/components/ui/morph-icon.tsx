import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two icons, one slot, one movement.
 *
 * A control whose meaning flips — play/pause, mute/unmute, open/close, a
 * choice made or not made — reads better when its icon *turns into* the
 * other one than when one disappears and another appears in its place.
 * Both glyphs occupy the same grid cell, and the pair rotates in opposite
 * directions so the eye follows a single object through the change instead
 * of registering two separate events.
 *
 * `spin` picks which way. It exists because direction carries meaning: a
 * control that opens something should turn one way and the thing that
 * closes it the other, so repeatedly toggling looks like one object going
 * back and forth rather than always spinning the same way.
 */
export function MorphIcon({
  on,
  off: Off,
  onIcon: On,
  className,
  spin = "cw",
}: {
  /** Which of the two is showing. */
  on: boolean;
  /** The resting icon. */
  off: LucideIcon;
  /** The icon it becomes. */
  onIcon: LucideIcon;
  className?: string;
  spin?: "cw" | "ccw";
}) {
  const out = spin === "cw" ? "morph-out-cw" : "morph-out-ccw";
  const back = spin === "cw" ? "morph-out-ccw" : "morph-out-cw";
  return (
    <span className="grid shrink-0 place-items-center">
      <Off
        aria-hidden
        className={cn("morph-layer", className, on ? out : "morph-in")}
      />
      <On
        aria-hidden
        className={cn("morph-layer", className, on ? "morph-in" : back)}
      />
    </span>
  );
}

/**
 * A tick that draws itself.
 *
 * Mounted only once something is actually confirmed, so the stroke running
 * along its own path is the confirmation — the difference between "this is
 * selected" and "this just became selected", which a static glyph can't
 * say. `key`-ing it on whatever changed replays the draw.
 */
export function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The dash length only has to be at least the path's own length;
      // over-estimating just means the stroke starts fully hidden.
      style={{ "--draw-len": "30" } as React.CSSProperties}
      className={cn("morph-draw", className)}
    >
      <polyline points="4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

/** The same idea for a refusal or a dismissal: two strokes, drawn in turn. */
export function DrawnCross({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      style={{ "--draw-len": "24" } as React.CSSProperties}
      className={cn("morph-draw", className)}
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
