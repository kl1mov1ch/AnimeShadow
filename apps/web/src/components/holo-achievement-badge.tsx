import type { AchievementRarity } from "@animeshadow/shared";
import {
  BookCopyIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  CheckCheckIcon,
  CompassIcon,
  CrownIcon,
  EyeIcon,
  FilmIcon,
  FlameIcon,
  Gamepad2Icon,
  GavelIcon,
  GemIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  LockIcon,
  type LucideIcon,
  MedalIcon,
  MessagesSquareIcon,
  MoonStarIcon,
  MusicIcon,
  PenLineIcon,
  PlayIcon,
  RocketIcon,
  ScanEyeIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  ThumbsUpIcon,
  TrophyIcon,
  TvIcon,
  VenetianMaskIcon,
  ZapIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  /** False keeps the look and drops the motion. */
  animated?: boolean;
  /** The hover card with how to earn it. Off where a parent shows one. */
  tip?: boolean;
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
  "referral-guide": CompassIcon,
  "referral-spark": FlameIcon,
  "referral-ambassador": MedalIcon,
  "referral-legend": TrophyIcon,
  "referral-star": SparklesIcon,
  "five-hundred-episodes": SparklesIcon,
  "curator-first": BookOpenIcon,
  "curator-trio": BookCopyIcon,
  "curator-views": EyeIcon,
  "curator-famous": RocketIcon,
  "curator-liked": ThumbsUpIcon,
  "curator-acclaimed": StarIcon,
  "curator-talk": MessagesSquareIcon,
  "collection-reader": BookOpenIcon,
  "collection-judge": GavelIcon,
  discussant: MessagesSquareIcon,
  "guess-rookie": Gamepad2Icon,
  "guess-streak": ScanEyeIcon,
  "guess-sharp": TargetIcon,
  "guess-top50": MedalIcon,
  "guess-top10": TrophyIcon,
  "guess-champion": CrownIcon,
};

/**
 * Each tier's metal, glow and silhouette: a disc for bronze, a hexagon for
 * rare, an octagon for epic, a sunburst disc for legendary.
 */
const TIER: Record<
  AchievementRarity,
  { from: string; via: string; to: string; ink: string; glow: string; clip: string }
> = {
  common: { from: "#f6c79b", via: "#c07a43", to: "#6b3a1c", ink: "#fff4e8", glow: "rgba(214,140,80,0.5)", clip: "circle(50% at 50% 50%)" },
  rare: {
    from: "#a5eeff",
    via: "#2f8fe0",
    to: "#173f8a",
    ink: "#eaf8ff",
    glow: "rgba(64,170,255,0.6)",
    clip: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
  },
  epic: {
    from: "#f5baff",
    via: "#a24bf0",
    to: "#4b1a8c",
    ink: "#fbefff",
    glow: "rgba(176,90,255,0.65)",
    clip: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
  },
  legendary: { from: "#fff5bf", via: "#f5b400", to: "#b3560a", ink: "#3a1a00", glow: "rgba(255,170,30,0.75)", clip: "circle(50% at 50% 50%)" },
};

/** A stable number per achievement — its hue, teeth and timing come from it. */
function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/**
 * An achievement as a living medallion, different for every achievement:
 * its own hue glowing in the face, its own count of teeth on a turning bezel,
 * its own dashed sigil turning the other way, its mark floating in the
 * middle and a holographic light crossing it now and then — and on top, the
 * rarity's motion: a breathing glow on bronze, an orbiting spark on rare, a
 * turning aura and twinkles on epic, rays, flame and embers on legendary.
 * Hovered, it tilts toward the pointer. Locked ones are dark iron with the
 * mark as a silhouette and the progress as a ring.
 *
 * Hovering (or focusing) it shows what it is for and how to earn it.
 */
export function HoloAchievementBadge({
  id,
  rarity,
  earned,
  earnedAt,
  progress,
  variant = "badge",
  animated = true,
  tip = true,
  onClick,
  className,
}: HoloAchievementBadgeProps) {
  const t = useT();
  const tier = TIER[rarity];
  const Icon = ICONS[id] ?? SparklesIcon;
  const title = t(`achievements.items.${id}.title` as "achievements.items.critic.title");
  const rarityLabel = t(`achievements.rarity.${rarity}` as "achievements.rarity.common");
  const percent =
    !earned && progress && progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : null;
  const n = seed(id);
  const hue = n % 360;
  const teeth = 8 + (n % 7);
  const delay = `${(n % 40) / 10}s`;

  const medallion = (
    <span className="achx-medal relative block aspect-square w-full">
      {earned && <Aura rarity={rarity} glow={tier.glow} hue={hue} />}

      {/* The bezel, with this achievement's own teeth, turning slowly. */}
      <span
        aria-hidden
        className="absolute inset-[3%]"
        style={{
          clipPath: tier.clip,
          background: earned ? `linear-gradient(145deg, ${tier.from}, ${tier.via} 45%, ${tier.to})` : "linear-gradient(145deg, #3a3d48, #16181f)",
        }}
      />
      {earned && (
        <span
          aria-hidden
          className="achx-spin absolute inset-[3%]"
          style={
            {
              clipPath: tier.clip,
              "--dur": `${18 + (n % 10)}s`,
              background: `repeating-conic-gradient(from ${n % 30}deg, rgba(255,255,255,0.45) 0deg 2.5deg, transparent 2.5deg ${360 / teeth}deg)`,
              maskImage: "radial-gradient(circle, transparent 60%, #000 64%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 60%, #000 64%)",
            } as CSSProperties
          }
        />
      )}

      {/* The face, in the tier's metal with this achievement's own hue. */}
      <span
        aria-hidden
        className="absolute inset-[12%] overflow-hidden"
        style={{
          clipPath: tier.clip,
          background: earned
            ? `radial-gradient(circle at 72% 82%, hsl(${hue} 95% 62% / 0.45), transparent 58%), radial-gradient(circle at 30% 24%, ${tier.from}, ${tier.via} 50%, ${tier.to} 100%)`
            : "radial-gradient(circle at 32% 26%, #2c2f39, #1a1c24 55%, #101117 100%)",
          boxShadow: "inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -6px 12px rgba(0,0,0,0.45)",
        }}
      >
        {earned && (
          <span
            className="achx-sheen absolute inset-y-[-20%] left-0 w-[45%] -skew-x-12 bg-gradient-to-r from-transparent via-white/65 to-transparent"
            style={{ animationDelay: delay }}
          />
        )}
      </span>

      {/* A sigil ring, dashed in its own rhythm, turning the other way. */}
      {earned && (
        <span
          aria-hidden
          className="achx-spin-back absolute inset-[20%] rounded-full"
          style={
            {
              "--dur": `${26 + (n % 12)}s`,
              border: `1.5px dashed color-mix(in srgb, ${tier.ink} 45%, transparent)`,
              opacity: 0.7,
            } as CSSProperties
          }
        />
      )}

      {/* The mark, floating in the middle. */}
      <span className={cn("absolute inset-0 grid place-items-center", earned && "achx-float")} style={{ animationDelay: delay }}>
        <Icon
          aria-hidden
          strokeWidth={2.2}
          className="h-[38%] w-[38%] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
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
  const body =
    variant === "circle" ? (
      <Root
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-label={title}
        className={cn("achx block size-14 shrink-0 select-none", !animated && "achx-still", className)}
      >
        {medallion}
      </Root>
    ) : (
      <Root
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn("achx group flex w-[200px] select-none flex-col items-center gap-2 text-center", !animated && "achx-still", className)}
      >
        <span className="block w-[64%]">{medallion}</span>
        <span className="flex flex-col items-center gap-0.5">
          <span
            className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", !earned && "text-muted-foreground")}
            style={earned ? { color: tier.via } : undefined}
          >
            {percent != null ? `${percent}%` : rarityLabel}
          </span>
          <span className={cn("line-clamp-2 text-sm font-semibold leading-tight", !earned && "text-muted-foreground")}>{title}</span>
        </span>
      </Root>
    );

  if (!tip) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 p-0">
        <AchievementTip id={id} rarity={rarity} earned={earned} earnedAt={earnedAt} progress={progress} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * What an achievement is for and how to earn it: its name and rarity, the
 * condition, and — not yet earned — how far along, or — earned — when.
 */
export function AchievementTip({
  id,
  rarity,
  earned,
  earnedAt,
  progress,
  children,
}: {
  id: string;
  rarity: AchievementRarity;
  earned: boolean;
  earnedAt?: string | null;
  progress?: { current: number; target: number } | null;
  children?: ReactNode;
}) {
  const t = useT();
  const labels = useLabels();
  const tier = TIER[rarity];
  const percent = progress && progress.target > 0 ? Math.min(100, (progress.current / progress.target) * 100) : null;
  return (
    <span className="flex flex-col gap-1.5 px-3 py-2.5 text-left">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold leading-tight">{t(`achievements.items.${id}.title` as "achievements.items.critic.title")}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide" style={{ color: tier.via }}>
          {t(`achievements.rarity.${rarity}` as "achievements.rarity.common")}
        </span>
      </span>
      <span className="text-xs leading-snug opacity-85">
        <span className="font-semibold">{earned ? "За что: " : "Как получить: "}</span>
        {t(`achievements.items.${id}.desc` as "achievements.items.critic.desc")}
      </span>
      {earned ? (
        earnedAt && <span className="text-[11px] opacity-70">{t("achievements.earnedOn", { date: labels.formatDate(earnedAt) ?? "" })}</span>
      ) : percent != null ? (
        <span className="flex flex-col gap-1">
          <span className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, percent)}%`, background: tier.via }} />
          </span>
          <span className="text-[11px] tabular-nums opacity-75">
            {progress!.current} из {progress!.target} · осталось {Math.max(0, progress!.target - progress!.current)}
          </span>
        </span>
      ) : (
        <span className="text-[11px] opacity-60">{t("achievements.locked")}</span>
      )}
      {children}
    </span>
  );
}

/** What moves behind an earned medallion, by tier. */
function Aura({ rarity, glow, hue }: { rarity: AchievementRarity; glow: string; hue: number }) {
  const halo = <span aria-hidden className="achx-breathe absolute inset-[4%] rounded-full blur-md" style={{ background: glow }} />;
  if (rarity === "common") return halo;

  if (rarity === "rare") {
    return (
      <>
        {halo}
        <span aria-hidden className="achx-spin absolute inset-[-4%]" style={{ "--dur": "4.5s" } as CSSProperties}>
          <span className="absolute left-1/2 top-0 size-[9%] -translate-x-1/2 rounded-full bg-cyan-100 shadow-[0_0_10px_3px_rgba(120,220,255,0.9)]" />
        </span>
      </>
    );
  }

  if (rarity === "epic") {
    return (
      <>
        {halo}
        <span
          aria-hidden
          className="achx-spin absolute inset-[-12%] rounded-full"
          style={
            {
              "--dur": "7s",
              background: `conic-gradient(from 0deg, transparent, rgba(200,110,255,0.85), transparent 30%, hsl(${hue} 90% 70% / 0.7), transparent 60%, rgba(140,90,255,0.85), transparent)`,
              maskImage: "radial-gradient(circle, transparent 46%, #000 52%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 46%, #000 52%, transparent 70%)",
            } as CSSProperties
          }
        />
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="lvl-twinkle absolute size-[6%] rounded-full bg-fuchsia-50"
            style={
              {
                left: `${[8, 86, 18][i]}%`,
                top: `${[16, 30, 84][i]}%`,
                "--dur": `${1.8 + i * 0.5}s`,
                "--delay": `${i * 0.4}s`,
                boxShadow: "0 0 7px 2px rgba(240,160,255,0.85)",
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
        className="achx-spin absolute inset-[-20%]"
        style={
          {
            "--dur": "12s",
            background: "repeating-conic-gradient(from 0deg, rgba(255,200,60,0.6) 0deg 6deg, transparent 6deg 18deg)",
            maskImage: "radial-gradient(circle, transparent 38%, #000 46%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 38%, #000 46%, transparent 70%)",
          } as CSSProperties
        }
      />
      <span
        aria-hidden
        className="achx-breathe absolute inset-[-6%] rounded-full blur-lg"
        style={{ background: "radial-gradient(circle, rgba(255,160,30,0.9), rgba(255,80,0,0.35) 55%, transparent 72%)" }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          className="lvl-ember absolute bottom-[12%] size-[6%] rounded-full"
          style={
            {
              left: `${[22, 36, 50, 64, 78][i]}%`,
              background: i % 2 ? "#ffd65a" : "#ff8a1f",
              boxShadow: "0 0 8px 2px rgba(255,150,30,0.9)",
              "--dur": `${1.8 + (i % 3) * 0.5}s`,
              "--delay": `${i * 0.35}s`,
              "--dx": `${i % 2 ? 1 : -1}`,
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
