import type { PublicProfile } from "@animeshadow/shared";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { PlasmaRing } from "@/components/profile/plasma-ring";
import { PLASMA_THEMES } from "@/components/profile/plasma-themes";
import { useT } from "@/i18n";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";

/**
 * A frame is a ring of moving light — see `plasma-ring` for how one is
 * built. Everything here is layout: where that ring sits relative to the
 * avatar, and how the picker shows it at thumbnail size.
 */

function FrameArt({ frame }: { frame: string }) {
  const theme = PLASMA_THEMES[frame];
  if (!theme) return null;
  return (
    // The ring is drawn outside the avatar's own circle, so its box hangs
    // past it on negative insets. The avatar keeps its natural size, which
    // is what stops the layout shifting when a frame is put on or taken off.
    <span aria-hidden className="pointer-events-none absolute -inset-[14%]">
      {/* The glow is a blurred copy of the same ring underneath, not a
          drop-shadow: a shadow follows the shape after the noise has torn
          it, which is exactly the edge that should be soft. */}
      <PlasmaRing
        theme={theme}
        className="absolute inset-0 opacity-70 blur-[6px]"
        style={{ color: theme.glow }}
      />
      <PlasmaRing theme={theme} className="absolute inset-0" />
    </span>
  );
}

/**
 * Wraps whatever avatar the caller draws in the frame the account wears.
 * Falls back to the rank ring it has always had when nothing is chosen, so
 * an account that never opens the picker looks exactly as it did before
 * frames existed.
 */
/** What the frame carries at its foot: a real number and the icon for it. */
export interface FrameBadge {
  icon: LucideIcon;
  value: number;
  /** Read out to assistive tech, since the pill itself is just a numeral. */
  label: string;
}

export function AvatarFrameRing({
  frame,
  fallback,
  badge,
  children,
}: {
  frame: PublicProfile["avatarFrame"];
  /** The rank ring, used when no frame is worn. */
  fallback: string;
  /** Only shown on a worn frame — the caps sit on the ring, so with no ring
   *  there is nothing for them to sit on. */
  badge?: FrameBadge;
  children: ReactNode;
}) {
  const theme = frame ? PLASMA_THEMES[frame] : undefined;
  if (!theme) {
    return (
      <div className={cn("rounded-full ring-4 ring-offset-2 ring-offset-card", fallback)}>
        {children}
      </div>
    );
  }
  return (
    <div className="relative isolate">
      <FrameArt frame={frame!} />
      <div className="relative rounded-full ring-2 ring-card">{children}</div>

      {/* Centred on the avatar's own edge — which is where the ring runs —
          so the mark reads as set into the frame rather than parked above
          it. No percentages: `top-0` plus a half-translate lands on the
          edge at every avatar size. */}
      <span
        aria-hidden
        className="frame-cap-mark absolute left-1/2 top-0 z-20 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-card bg-card text-[color:var(--cap)] shadow-lg"
        style={{ "--cap": theme.glow } as React.CSSProperties}
      >
        <LogoGlyph className="size-4" />
      </span>

      {badge && <FrameCapBadge badge={badge} colour={theme.glow} />}
    </div>
  );
}

/** The foot of the ring: an icon that steps, and a number that counts up to
 *  the real one on first paint. */
function FrameCapBadge({ badge, colour }: { badge: FrameBadge; colour: string }) {
  const shown = useCountUp(badge.value);
  const Icon = badge.icon;
  return (
    <span
      aria-label={badge.label}
      className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 translate-y-1/2 items-center gap-1 rounded-full border border-card bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-lg"
      style={{ color: colour }}
    >
      <Icon className="frame-cap-icon size-3" />
      {shown}
    </span>
  );
}

/** The swatch in the picker: the same ring at thumbnail size, with the card
 *  colour standing in for the avatar. */
export function FramePreview({ frame, className }: { frame: string; className?: string }) {
  if (!PLASMA_THEMES[frame]) {
    return (
      <span
        className={cn(
          "block rounded-full bg-secondary/60 ring-2 ring-border/60 ring-offset-2 ring-offset-card",
          className,
        )}
      />
    );
  }
  return (
    <span className={cn("relative isolate block rounded-full", className)}>
      <FrameArt frame={frame} />
      <span className="relative block size-full rounded-full bg-card" />
    </span>
  );
}

/**
 * The line under the name. Fixed, earned, and hideable — picking nothing is
 * a real choice, which is why it is a nullable field and not a checkbox
 * bolted onto one.
 */
export function ProfileTitleBadge({
  title,
  className,
}: {
  title: PublicProfile["profileTitle"];
  className?: string;
}) {
  const t = useT();
  if (!title) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary",
        className,
      )}
    >
      {t(`profile.cosmetics.titleNames.${title}` as "profile.cosmetics.titleNames.newcomer")}
    </span>
  );
}
