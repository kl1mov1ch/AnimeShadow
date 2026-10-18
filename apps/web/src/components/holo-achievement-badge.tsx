import type { AchievementRarity } from "@animeshadow/shared";
import { useAchievementDesc } from "@/lib/secret-achievements";
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
import { useId, type ReactNode } from "react";
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
  "thousand-episodes": LayersIcon,
  "three-thousand-episodes": CrownIcon,
  "ten-series": CheckCheckIcon,
  "twenty-five-series": LibraryIcon,
  "fifty-series": CompassIcon,
  "review-explorer": StarIcon,
  "collection-architect": BookCopyIcon,
  "collection-library": GemIcon,
  "curator-crowd": EyeIcon,
  "century-comments": MessagesSquareIcon,
  "guess-century": Gamepad2Icon,
  "genre-master": FlameIcon,
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

/** A static SVG medal: a distinct silhouette by rarity, with no animation layers. */
export function HoloAchievementBadge({ id, rarity, earned, earnedAt, progress, variant = "badge", tip = true, onClick, className }: HoloAchievementBadgeProps) {
  const t = useT();
  const gradient = useId().replace(/:/g, "");
  const tier = TIER[rarity];
  const Icon = ICONS[id] ?? SparklesIcon;
  const title = t(`achievements.items.${id}.title` as "achievements.items.critic.title");
  const percent = progress && progress.target > 0 ? Math.max(0, Math.min(100, progress.current / progress.target * 100)) : 0;
  const shape = rarity === "rare" ? "50,4 90,27 90,73 50,96 10,73 10,27" : rarity === "epic" ? "30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" : "50,3 63,13 80,11 86,27 98,39 91,55 92,73 76,82 65,97 48,91 31,96 21,80 5,71 9,53 3,37 18,26 24,10 42,12";
  const medal = <span className="relative block aspect-square w-full max-w-24">
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor={earned ? tier.from : "#64748b"}/><stop offset="1" stopColor={earned ? tier.to : "#1e293b"}/></linearGradient></defs>
      {rarity === "common" ? <circle cx="50" cy="50" r="45" fill={`url(#${gradient})`}/> : <polygon points={shape} fill={`url(#${gradient})`}/>}
      <circle cx="50" cy="50" r="33" fill="black" fillOpacity=".24" stroke={earned ? tier.from : "#94a3b8"} strokeOpacity=".5" strokeWidth="1.5"/>
      {!earned && percent > 0 && <circle cx="50" cy="50" r="43" fill="none" stroke={tier.from} strokeWidth="3" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 50 50)"/>}
    </svg>
    <Icon aria-hidden className="absolute left-1/2 top-1/2 size-[38%] -translate-x-1/2 -translate-y-1/2" strokeWidth={1.6} style={{ color: earned ? tier.ink : "#94a3b8" }}/>
    {!earned && <LockIcon aria-hidden className="absolute bottom-[10%] right-[10%] size-[18%] rounded bg-card p-0.5 text-muted-foreground"/>}
  </span>;
  const content = <span className={cn("inline-flex min-w-0 flex-col items-center gap-1.5 text-center", variant === "circle" ? "w-10" : "w-full", !earned && "opacity-65", className)}>
    {medal}
    {variant === "badge" && <><span className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-snug">{title}</span><span className="text-[10px]" style={{ color: earned ? tier.from : undefined }}>{t(`achievements.rarity.${rarity}` as "achievements.rarity.common")}</span></>}
  </span>;
  const trigger = onClick ? <button type="button" aria-label={title} onClick={onClick} className="min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</button> : content;
  return tip ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent className="max-w-72 p-0"><AchievementTip id={id} rarity={rarity} earned={earned} earnedAt={earnedAt} progress={progress}/></TooltipContent></Tooltip> : trigger;
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
  const desc = useAchievementDesc(id, earned, t(`achievements.items.${id}.desc` as "achievements.items.critic.desc"));
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
        {desc}
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
