import type { PublicProfile } from "@animeshadow/shared";
import {
  CheckCheckIcon,
  CoffeeIcon,
  CompassIcon,
  CrownIcon,
  HeartHandshakeIcon,
  MedalIcon,
  FootprintsIcon,
  GemIcon,
  LibraryIcon,
  type LucideIcon,
  MoonStarIcon,
  ShieldIcon,
  SparklesIcon,
  SproutIcon,
  SwordIcon,
  TvIcon,
  ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { FrameFx, FrameRing, frameGlow, hasFrame } from "@/components/profile/frame-fx";
import { useT } from "@/i18n";
import { useCountUp } from "@/lib/use-count-up";
import { requirementText, titleCosmetic } from "@/lib/cosmetics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";

/**
 * A frame is a thin turning rim plus what moves on the avatar — see
 * `frame-fx`. Everything here is layout: where the two layers sit relative
 * to the avatar, and how the picker shows them at thumbnail size.
 */

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
  cap = true,
  children,
}: {
  frame: PublicProfile["avatarFrame"];
  /** The 影 mark on top of the ring — off where there is no room above it,
   *  like the header. */
  cap?: boolean;
  /** The rank ring, used when no frame is worn. */
  fallback: string;
  /** Only shown on a worn frame — the caps sit on the ring, so with no ring
   *  there is nothing for them to sit on. */
  badge?: FrameBadge;
  children: ReactNode;
}) {
  if (!FEATURES.avatarFrames || !frame || !hasFrame(frame)) {
    return (
      <div className={cn("rounded-full ring-4 ring-offset-2 ring-offset-card", fallback)}>
        {children}
      </div>
    );
  }
  return (
    <div className="relative isolate">
      <FrameRing frame={frame} />
      <div className="relative rounded-full ring-2 ring-card">{children}</div>
      <FrameFx frame={frame} />

      {/* Centred on the avatar's own edge — which is where the ring runs —
          so the mark reads as set into the frame rather than parked above
          it. No percentages: `top-0` plus a half-translate lands on the
          edge at every avatar size. */}
      {cap && <span
        aria-hidden
        className="frame-cap-mark absolute left-1/2 top-0 z-20 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-card bg-card text-[color:var(--cap)] shadow-lg"
        style={{ "--cap": frameGlow(frame) } as React.CSSProperties}
      >
        <LogoGlyph className="size-4" />
      </span>}

      {badge && <FrameCapBadge badge={badge} colour={frameGlow(frame)} />}
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
  if (!hasFrame(frame)) {
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
      <FrameRing frame={frame} />
      <span className="relative block size-full rounded-full bg-card" />
      <FrameFx frame={frame} small />
    </span>
  );
}

/**
 * How each title looks: its own mark, its two colours, and what it does
 * under the pointer — "shimmer" sweeps a light, "neon" flickers, "glitch"
 * jitters, "aurora" glows in both colours — so two titles never look alike.
 */
const TITLE_STYLE: Record<
  string,
  { icon: LucideIcon; c1: string; c2: string; fx: "shimmer" | "neon" | "glitch" | "aurora" }
> = {
  newcomer: { icon: SproutIcon, c1: "#34d399", c2: "#d1fae5", fx: "shimmer" },
  "first-steps": { icon: FootprintsIcon, c1: "#38bdf8", c2: "#e0f2fe", fx: "shimmer" },
  "night-watch": { icon: MoonStarIcon, c1: "#818cf8", c2: "#e0e7ff", fx: "neon" },
  "serial-viewer": { icon: TvIcon, c1: "#fb7185", c2: "#ffe4e6", fx: "shimmer" },
  marathoner: { icon: ZapIcon, c1: "#facc15", c2: "#fff7c2", fx: "neon" },
  "sharp-tongue": { icon: SwordIcon, c1: "#f43f5e", c2: "#fecdd3", fx: "glitch" },
  archivist: { icon: LibraryIcon, c1: "#d6a35c", c2: "#fdf0d5", fx: "shimmer" },
  "genre-sage": { icon: CompassIcon, c1: "#a78bfa", c2: "#22d3ee", fx: "aurora" },
  completionist: { icon: CheckCheckIcon, c1: "#10b981", c2: "#67e8f9", fx: "aurora" },
  "old-guard": { icon: ShieldIcon, c1: "#f59e0b", c2: "#fff1c1", fx: "shimmer" },
  patron: { icon: GemIcon, c1: "#f472b6", c2: "#60a5fa", fx: "aurora" },
  regular: { icon: CoffeeIcon, c1: "#2dd4bf", c2: "#ccfbf1", fx: "shimmer" },
  "season-veteran": { icon: MedalIcon, c1: "#fb923c", c2: "#ffedd5", fx: "neon" },
  "shadow-lord": { icon: CrownIcon, c1: "#e11d48", c2: "#c4b5fd", fx: "glitch" },
  benefactor: { icon: HeartHandshakeIcon, c1: "#f472b6", c2: "#fde68a", fx: "aurora" },
};

/** Where the sparks fly when a title is hovered: x, y in px, delay in s. */
const SPARKS: Array<[number, number, number]> = [
  [-14, -12, 0],
  [12, -14, 0.05],
  [20, 2, 0.1],
  [-20, 4, 0.08],
  [4, -18, 0.12],
];

/**
 * The line under the name, as a small living badge — each title with its
 * own mark and colours. A light crosses it now and then; under the pointer
 * it lifts and glows, its mark turns, sparks fly off it and its text does
 * its own trick, and a card says what the title is and how it was (or is)
 * earned. Fixed, earned, and hideable: picking nothing is a real choice.
 */
/** A title as a small round mark — its icon on its own colours — for
 *  places with no room for the whole badge. */
export function TitleMark({ title, size = 46, className }: { title: string; size?: number; className?: string }) {
  const style = TITLE_STYLE[title] ?? { icon: SparklesIcon, c1: "var(--primary)", c2: "#ffffff", fx: "shimmer" as const };
  const Icon = style.icon;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full text-white shadow-lg ring-2 ring-white/20", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${style.c1}, ${style.c2})`, boxShadow: `0 6px 18px -6px ${style.c1}` }}
    >
      <Icon className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  );
}

export function ProfileTitleBadge({
  title,
  className,
  tip = true,
  size = "sm",
}: {
  title: PublicProfile["profileTitle"] | string;
  className?: string;
  /** The card on hover. Off inside a picker, which shows its own. */
  tip?: boolean;
  size?: "sm" | "md";
}) {
  const t = useT();
  if (!title) return null;
  const style = TITLE_STYLE[title] ?? { icon: SparklesIcon, c1: "var(--primary)", c2: "#ffffff", fx: "shimmer" as const };
  const Icon = style.icon;
  const label = t(`profile.cosmetics.titleNames.${title}` as "profile.cosmetics.titleNames.newcomer");
  const cosmetic = titleCosmetic(title);

  const badge = (
    <span
      data-fx={style.fx}
      className={cn(
        "ptitle relative isolate inline-flex shrink-0 cursor-default items-center gap-1 overflow-visible rounded-full border font-bold tracking-wide",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        className,
      )}
      style={
        {
          "--t1": style.c1,
          "--t2": style.c2,
          borderColor: `color-mix(in srgb, ${style.c1} 55%, transparent)`,
          background: `linear-gradient(120deg, color-mix(in srgb, ${style.c1} 20%, transparent), color-mix(in srgb, ${style.c2} 8%, transparent))`,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span className="ptitle-sheen absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      </span>
      <Icon className={cn("ptitle-icon relative", size === "md" ? "size-3.5" : "size-3")} style={{ color: style.c1 }} />
      <span
        className="ptitle-text relative"
        style={{ backgroundImage: `linear-gradient(90deg, ${style.c1}, ${style.c2})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
      >
        {label}
      </span>
      {SPARKS.map(([x, y, d], i) => (
        <span
          key={i}
          aria-hidden
          className="ptitle-spark pointer-events-none absolute left-1/2 top-1/2 size-1 rounded-full"
          style={{ "--x": `${x}px`, "--y": `${y}px`, "--d": `${d}s`, background: i % 2 ? style.c1 : style.c2, boxShadow: `0 0 6px ${style.c1}` } as React.CSSProperties}
        />
      ))}
    </span>
  );

  if (!tip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-60">
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">Приписка «{label}»</span>
          {cosmetic && <span className="text-xs opacity-80">{requirementText(cosmetic, t as never)}</span>}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
