import { ACHIEVEMENTS } from "@animeshadow/shared";
import { AwardIcon, CrownIcon, MedalIcon, StarIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

const RARITY_ICON = {
  common: AwardIcon,
  rare: MedalIcon,
  epic: StarIcon,
  legendary: CrownIcon,
} as const;

const RARITY_CLASS = {
  common: "border-border/60 bg-secondary text-muted-foreground",
  rare: "border-sky-500/40 bg-sky-500/10 text-sky-500",
  epic: "border-violet-500/50 bg-violet-500/10 text-violet-400",
  legendary: "border-amber-400/60 bg-amber-400/10 text-amber-500",
} as const;

/** Small badge for a user's showcased achievement, next to their name. Renders nothing if unset/unknown. */
export function AchievementBadge({
  id,
  className,
  /** Icon only, no title text — for a dense list of badges (a comment
   * header) where several of these side by side would otherwise crowd out
   * the actual message. The title moves into a hover tooltip instead of
   * disappearing. */
  compact = false,
}: {
  id: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  const Icon = RARITY_ICON[def.rarity];
  const title = t(`achievements.items.${def.id}.title` as "achievements.items.critic.title");
  const rarityLabel = t(`achievements.rarity.${def.rarity}` as "achievements.rarity.common");

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-md border",
              RARITY_CLASS[def.rarity],
              className,
            )}
          >
            <Icon className="size-2.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {title} · {rarityLabel}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        RARITY_CLASS[def.rarity],
        className,
      )}
    >
      <Icon className="size-3" />
      {title}
    </span>
  );
}
