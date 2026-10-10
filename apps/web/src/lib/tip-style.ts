/**
 * The one look every hint on the site wears — Radix tooltips, the `title`
 * hints GlobalTitleTooltips draws, and hover cards alike: the plain popover
 * surface with a hairline border and an ordinary shadow.
 *
 * No accent colour and no glow. A hint is read for a second and forgotten;
 * the red edge and red-tinted shadow they used to have pulled the eye harder
 * than the thing they were explaining, and three slightly different versions
 * of it made the site look less finished, not more.
 */
export const TIP_SURFACE =
  "border border-border/70 bg-popover text-popover-foreground shadow-lg shadow-black/25";

/** A text hint: small, unhurried, the same size everywhere. */
export const TIP_TEXT =
  "max-w-[min(18rem,80vw)] rounded-md px-2.5 py-1.5 text-xs font-normal leading-snug text-balance";

/**
 * A soft fade with a 4px drift from the side it points from, on a long
 * ease-out; it leaves a little faster than it came, without the drift.
 */
export const TIP_MOTION =
  "animate-in fade-in-0 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150";
