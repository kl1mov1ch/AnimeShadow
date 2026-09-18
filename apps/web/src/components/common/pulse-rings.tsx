import { cn } from "@/lib/utils";

/**
 * Three rings breathing outward — ambient background motion, in whatever
 * colour the surrounding text is.
 *
 * This was a Lottie animation, and lottie-web costs 300KB to draw it. For
 * three concentric circles that is indefensible on a phone, so it is three
 * concentric circles: inline SVG, a CSS keyframe, no runtime at all. Being
 * SVG it still inherits `currentColor`, so one element reads correctly in
 * either theme exactly as before.
 *
 * Reduced motion is honoured by the keyframe itself (see index.css), not by
 * a JS check, so there is nothing to run before it can decide.
 */
export function PulseRings({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none", className)}>
      <svg viewBox="0 0 200 200" className="size-full overflow-visible">
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx="100"
            cy="100"
            r="60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pulse-ring"
            // Staggered so the three read as one wave rather than a pulse.
            style={{ animationDelay: `${i * 2}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
