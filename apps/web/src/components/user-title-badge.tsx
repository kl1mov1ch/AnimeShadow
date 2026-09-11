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
}: {
  prefix: string | null | undefined;
  icon: TitleIcon | null | undefined;
  className?: string;
}) {
  if (!prefix) return null;
  const Icon = icon ? TITLE_ICON_COMPONENT[icon] : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary",
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {prefix}
    </span>
  );
}
