import type { EarnedAchievement } from "@animeshadow/shared";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";

/**
 * Opens whichever achievement was clicked, centred on screen, at a larger
 * size, with its description underneath. Shared by the achievements grid
 * and the pinned-achievement circles under a name, since both need the same
 * "click a badge, see what it is" behaviour.
 */
export function AchievementDetailDialog({
  achievement,
  onOpenChange,
}: {
  achievement: EarnedAchievement | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const labels = useLabels();

  return (
    <Dialog open={achievement != null} onOpenChange={onOpenChange}>
      {/* sm:max-w-sm, not plain max-w-sm — the base DialogContent's own
          max-w-[calc(100%-2rem)] is what keeps this from touching the
          screen edges on a narrow phone; an unprefixed override here would
          replace it instead of just capping the width on wider screens. */}
      <DialogContent className="sm:max-w-sm">
        {achievement && (
          <div className="flex flex-col items-center gap-4 pt-2 text-center">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {t(`achievements.items.${achievement.id}.title` as "achievements.items.critic.title")}
              </DialogTitle>
              <DialogDescription>
                {t(`achievements.items.${achievement.id}.desc` as "achievements.items.critic.desc")}
              </DialogDescription>
            </DialogHeader>

            <HoloAchievementBadge
              id={achievement.id}
              rarity={achievement.rarity}
              earned={achievement.earned}
              earnedAt={achievement.earnedAt}
              progress={achievement.progress}
              className="w-[200px] sm:w-[240px]"
            />

            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(`achievements.items.${achievement.id}.desc` as "achievements.items.critic.desc")}
            </p>

            {achievement.earned && achievement.earnedAt && (
              <p className="text-xs text-primary/80">
                {t("achievements.earnedOn", {
                  date: labels.formatDate(achievement.earnedAt) ?? "",
                })}
              </p>
            )}
            {!achievement.earned && !achievement.progress && (
              <p className="text-xs text-muted-foreground/70">
                {achievement.manual ? t("achievements.manualNote") : t("achievements.locked")}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
