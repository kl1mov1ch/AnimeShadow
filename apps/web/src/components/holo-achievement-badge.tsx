import type { AchievementRarity } from "@animeshadow/shared";
import {
  CalendarCheckIcon,
  CheckCheckIcon,
  CompassIcon,
  CrownIcon,
  FilmIcon,
  FlameIcon,
  GemIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  LockIcon,
  type LucideIcon,
  MoonStarIcon,
  MusicIcon,
  PenLineIcon,
  PlayIcon,
  RocketIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TvIcon,
  VenetianMaskIcon,
  ZapIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface HoloAchievementBadgeProps {
  id: string;
  rarity: AchievementRarity;
  earned: boolean;
  earnedAt?: string | null;
  /** Only meaningful when `earned` is false. */
  progress?: { current: number; target: number } | null;
  /** "badge" (medallion with its name and rarity under it) or "circle"
   *  (the medallion alone, for small places). */
  variant?: "badge" | "circle";
  /** False keeps the look and drops the motion — for grids of many badges. */
  animated?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Every achievement has its own mark — what it is for, not what tier it is. */
const ICONS: Record<string, LucideIcon> = {
  "first-episode": PlayIcon,
  "first-review": PenLineIcon,
  "first-series": TvIcon,
  "first-donate": HeartIcon,
  "fifty-episodes": FilmIcon,
  "hundred-episodes": LayersIcon,
  "hot-start": FlameIcon,
  "night-owl": MoonStarIcon,
  "week-streak": CalendarCheckIcon,
  critic: StarIcon,
  marathoner: ZapIcon,
  melomaniac: MusicIcon,
  "genre-expert": CompassIcon,
  bibliophile: LibraryIcon,
  "anon-critic": VenetianMaskIcon,
  completionist: CheckCheckIcon,
  "early-adopter": RocketIcon,
  veteran: ShieldIcon,
  patron: GemIcon,
  supporter: CrownIcon,
};

/**
 * Each tier's metal, glow, shape and motion. The shape is a clip-path so
 * the medallion itself — not a box around it — carries the silhouette:
 * a disc for bronze, a hexagon for rare, an octagon for epic, a sunburst
 * disc for legendary.
 */
const TIER: Record<
  AchievementRarity,
  { from: string; via: string; to: string; ink: string; glow: string; clip: string }
> = {
  common: {
    from: "#f0b27a",
    via: "#b8703d",
    to: "#6b3a1c",
    ink: "#fff4e8",
    glow: "rgba(214,140,80,0.45)",
    clip: "circle(50% at 50% 50%)",
  },
  rare: {
    from: "#8be9ff",
    via: "#2f8fe0",
    to: "#173f8a",
    ink: "#eaf8ff",
    glow: "rgba(64,170,255,0.55)",
    clip: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
  },
  epic: {
    from: "#f0a6ff",
    via: "#a24bf0",
    to: "#4b1a8c",
    ink: "#fbefff",
    glow: "rgba(176,90,255,0.6)",
    clip: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
  },
  legendary: {
    from: "#fff1a8",
    via: "#f5b400",
    to: "#b3560a",
    ink: "#3a1a00",
    glow: "rgba(255,170,30,0.7)",
    clip: "circle(50% at 50% 50%)",
  },
};

/**
 * An achievement as a medallion.
 *
 * Earned ones are metal in their tier's colour with the achievement's own
 * mark on the face, and they move: bronze catches a slow shine, rare pulses
 * with a spark circling it, epic sits in a turning aura, legendary burns
 * with rotating rays and rising embers. Locked ones are the same shape in
 * dark iron with the mark as a silhouette and, where the server counts
 * progress, a ring filling around them.
 */
export function HoloAchievementBadge({
  id,
  rarity,
  earned,
  earnedAt,
  progress,
  variant = "badge",
  animated = true,
  onClick,
  className,
}: HoloAchievementBadgeProps) {
  const t = useT();
  const labels = useLabels();
  const tier = TIER[rarity];
  const Icon = ICONS[id] ?? SparklesIcon;
  const title = t(`achievements.items.${id}.title` as "achievements.items.critic.title");
  const rarityLabel = t(`achievements.rarity.${rarity}` as "achievements.rarity.common");
  const percent =
    !earned && progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : null;
  const tip = earned
    ? earnedAt
      ? `${title} · ${t("achievements.earnedOn", { date: labels.formatDate(earnedAt) ?? "" })}`
      : title
    : percent != null
      ? `${title} · ${progress!.current}/${progress!.target}`
      : title;

  const medallion = (
    <span className="relative block aspect-square w-full">
      {earned && <Aura rarity={rarity} glow={tier.glow} />}

      {/* The rim: a slightly larger copy of the shape in the tier's dark metal. */}
      <span
        aria-hidden
        className="absolute inset-[4%]"
        style={{
          clipPath: tier.clip,
          background: earned
            ? `linear-gradient(145deg, ${tier.from}, ${tier.to})`
            : "linear-gradient(145deg, #3a3d48, #16181f)",
        }}
      />
      {/* The face. */}
      <span
        aria-hidden
        className="absolute inset-[11%] overflow-hidden"
        style={{
          clipPath: tier.clip,
          background: earned
            ? `radial-gradient(circle at 32% 26%, ${tier.from}, ${tier.via} 48%, ${tier.to} 100%)`
            : "radial-gradient(circle at 32% 26%, #2c2f39, #1a1c24 55%, #101117 100%)",
        }}
      >
        {earned && (
          <span className="ach-shine absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent" />
        )}
      </span>

      <span className="absolute inset-0 grid place-items-center">
        <Icon
          aria-hidden
          strokeWidth={2.2}
          className={cn("w-[38%] h-[38%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]", earned && "ach-pop")}
          style={{ color: earned ? tier.ink : "rgba(160,165,180,0.45)" }}
        />
      </span>

      {!earned && (
        <span className="absolute bottom-[6%] right-[6%] grid size-[26%] place-items-center rounded-full border border-white/10 bg-[#0d0e13] text-white/60">
          <LockIcon className="size-[55%]" />
        </span>
      )}

      {percent != null && <ProgressRing percent={percent} />}
    </span>
  );

  const Root = onClick ? "button" : "span";

  if (variant === "circle") {
    return (
      <Root
        type={onClick ? "button" : undefined}
        onClick={onClick}
        title={tip}
        aria-label={title}
        className={cn(
          "ach-root block size-14 shrink-0 select-none transition-transform duration-300 hover:scale-110",
          !animated && "ach-still",
          className,
        )}
      >
        {medallion}
      </Root>
    );
  }

  return (
    <Root
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={tip}
      className={cn(
        "ach-root group flex w-[200px] select-none flex-col items-center gap-2 text-center",
        !animated && "ach-still",
        className,
      )}
    >
      <span className="block w-[64%] transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105">
        {medallion}
      </span>
      <span className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.14em]",
            !earned && "text-muted-foreground",
          )}
          style={earned ? { color: tier.via } : undefined}
        >
          {percent != null ? `${percent}%` : rarityLabel}
        </span>
        <span className={cn("line-clamp-2 text-sm font-semibold leading-tight", !earned && "text-muted-foreground")}>
          {title}
        </span>
      </span>
    </Root>
  );
}

/** What moves behind an earned medallion, by tier. */
function Aura({ rarity, glow }: { rarity: AchievementRarity; glow: string }) {
  if (rarity === "common") {
    return (
      <span
        aria-hidden
        className="absolute inset-[8%] rounded-full blur-md"
        style={{ background: glow, opacity: 0.55 }}
      />
    );
  }

  if (rarity === "rare") {
    return (
      <>
        <span aria-hidden className="ach-pulse absolute inset-0 rounded-full blur-lg" style={{ background: glow }} />
        <span aria-hidden className="ach-spin absolute inset-[-2%]" style={{ "--dur": "4.5s" } as CSSProperties}>
          <span className="absolute left-1/2 top-0 size-[9%] -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_10px_3px_rgba(120,220,255,0.9)]" />
        </span>
      </>
    );
  }

  if (rarity === "epic") {
    return (
      <>
        <span
          aria-hidden
          className="ach-spin absolute inset-[-10%] rounded-full opacity-80 blur-[3px]"
          style={
            {
              "--dur": "7s",
              background:
                "conic-gradient(from 0deg, transparent, rgba(200,110,255,0.75), transparent 30%, rgba(255,110,220,0.6), transparent 60%, rgba(140,90,255,0.75), transparent)",
              maskImage: "radial-gradient(circle, transparent 45%, black 52%, transparent 72%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 45%, black 52%, transparent 72%)",
            } as CSSProperties
          }
        />
        <span aria-hidden className="ach-pulse absolute inset-[6%] rounded-full blur-md" style={{ background: glow }} />
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="scene-star absolute size-[5%] rounded-full bg-fuchsia-100"
            style={
              {
                left: `${[12, 84, 20][i]}%`,
                top: `${[18, 30, 82][i]}%`,
                "--dur": `${1.8 + i * 0.5}s`,
                "--delay": `${i * 0.4}s`,
                boxShadow: "0 0 6px 2px rgba(240,160,255,0.8)",
              } as CSSProperties
            }
          />
        ))}
      </>
    );
  }

  // legendary
  return (
    <>
      <span
        aria-hidden
        className="ach-spin absolute inset-[-18%]"
        style={
          {
            "--dur": "12s",
            background:
              "repeating-conic-gradient(from 0deg, rgba(255,190,40,0.55) 0deg 7deg, transparent 7deg 20deg)",
            maskImage: "radial-gradient(circle, transparent 38%, black 46%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 38%, black 46%, transparent 70%)",
          } as CSSProperties
        }
      />
      <span
        aria-hidden
        className="ach-flicker absolute inset-[-4%] rounded-full blur-lg"
        style={{ background: "radial-gradient(circle, rgba(255,150,20,0.85), rgba(255,80,0,0.35) 55%, transparent 72%)" }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          className="ach-ember absolute bottom-[14%] size-[6%] rounded-full"
          style={
            {
              left: `${[22, 38, 52, 64, 76][i]}%`,
              background: i % 2 ? "#ffcf4a" : "#ff8a1f",
              boxShadow: "0 0 8px 2px rgba(255,150,30,0.85)",
              "--dur": `${1.8 + (i % 3) * 0.5}s`,
              "--delay": `${i * 0.35}s`,
              "--dx": `${i % 2 ? 6 : -6}px`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

/** How far toward a locked achievement, as a ring around the medallion. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 47;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-primary transition-[stroke-dashoffset] duration-700"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
      />
    </svg>
  );
}
