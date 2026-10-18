import type { TitleIcon } from "@animeshadow/shared";
import {
  CrownIcon,
  FlameIcon,
  GemIcon,
  GhostIcon,
  HeartIcon,
  MoonIcon,
  ShieldIcon,
  SkullIcon,
  SparklesIcon,
  StarIcon,
  SwordIcon,
  ZapIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const TITLE_ICON_COMPONENT: Record<TitleIcon, typeof StarIcon> = {
  sword: SwordIcon,
  flame: FlameIcon,
  crown: CrownIcon,
  star: StarIcon,
  heart: HeartIcon,
  skull: SkullIcon,
  ghost: GhostIcon,
  zap: ZapIcon,
  gem: GemIcon,
  moon: MoonIcon,
  sparkles: SparklesIcon,
  shield: ShieldIcon,
};

/** PRO custom title (prefix + icon), shown next to a display name. Renders nothing if unset. */
export function UserTitleBadge({
  prefix,
  icon,
  className,
  /** Icon only, no text — the full title moves into a hover tooltip. For a
   * dense list of badges (a comment header) where the text version would
   * otherwise dominate the line. */
  compact = false,
}: {
  prefix: string | null | undefined;
  icon: TitleIcon | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!prefix) return null;
  const Icon = icon ? TITLE_ICON_COMPONENT[icon] : null;
  const tone = icon === "flame" || icon === "sword" ? "text-rose-300 border-rose-400/25 bg-rose-400/10" : icon === "moon" || icon === "ghost" ? "text-violet-300 border-violet-400/25 bg-violet-400/10" : icon === "crown" || icon === "gem" ? "text-amber-300 border-amber-400/25 bg-amber-400/10" : "text-sky-300 border-sky-400/25 bg-sky-400/10";

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary",
              tone, className,
            )}
          >
            {Icon ? <Icon className="size-2.5" /> : prefix.charAt(0)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{prefix}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium", tone,
        className,
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" />}
      <span className="truncate" title={prefix}>{prefix}</span>
    </span>
  );
}
