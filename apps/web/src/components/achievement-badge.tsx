import { ACHIEVEMENTS } from "@animeshadow/shared";
import { AwardIcon, CrownIcon, MedalIcon, StarIcon } from "lucide-react";
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
}: {
  id: string | null | undefined;
  className?: string;
}) {
  const t = useT();
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  const Icon = RARITY_ICON[def.rarity];

  return (
    <span
      title={t(`achievements.items.${def.id}.title` as "achievements.items.critic.title")}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        RARITY_CLASS[def.rarity],
        className,
      )}
    >
      <Icon className="size-3" />
      {t(`achievements.items.${def.id}.title` as "achievements.items.critic.title")}
    </span>
  );
}
