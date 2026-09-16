import type { EarnedAchievement, PublicProfile, Rank } from "@animeshadow/shared";
import { ClockIcon, FilmIcon, ThumbsUpIcon, TrophyIcon } from "lucide-react";
import { fmtDuration } from "@/components/anime/progress-row";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserTitleBadge } from "@/components/user-title-badge";
import { useLocale, useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { usePublicProfile, usePublicProfileById } from "@/lib/query";
import { cn } from "@/lib/utils";

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

/** Who the modal is open for — by username when the comment author has one,
 * otherwise by id (every commenter is clickable, claimed handle or not). */
export type ProfileModalTarget = { id: string | null; username: string | null };

/**
 * A comment author, one click away from their full public profile — without
 * leaving the thread. Same identity block as the profile page's own hero,
 * shrunk to a dialog: avatar, name, bio, pinned achievements, and the stats
 * a reader actually wants at a glance (hours watched, rank, and standing
 * among commenters) rather than the full progress/achievements tabs.
 */
export function UserProfileModal({
  target,
  onOpenChange,
}: {
  target: ProfileModalTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const byUsername = usePublicProfile(target?.username ?? undefined);
  const byId = usePublicProfileById(
    target && !target.username ? (target.id ?? undefined) : undefined,
  );
  const { data, isPending, isError } = target?.username ? byUsername : byId;

  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="sr-only">
          <DialogTitle>{data?.displayName ?? t("profile.title")}</DialogTitle>
          <DialogDescription>{t("comments.viewProfile")}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("errors.genericTitle")}
          </p>
        ) : (
          <ProfileModalBody profile={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileModalBody({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const memberSince = new Date(profile.memberSince).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // Same rule as the profile page itself: only ids that are still actually
  // earned, in the order the owner picked.
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a): a is EarnedAchievement => a != null);

  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      <div
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-display text-2xl ring-2 ring-offset-4 ring-offset-background",
          RANK_RING[profile.rank],
        )}
      >
        {profile.avatarUrl ? (
          <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg leading-tight [overflow-wrap:anywhere]">
            {profile.displayName}
          </h2>
          <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
        </div>
        {profile.username && (
          <p className="text-xs text-muted-foreground">
            {t("profile.handle", { username: profile.username })}
          </p>
        )}
      </div>

      {profile.bio && (
        <p className="max-w-[22rem] text-sm leading-relaxed text-foreground/85">{profile.bio}</p>
      )}

      {pinned.length > 0 && (
        <div className="flex items-center gap-2">
          {pinned.map((a) => (
            <HoloAchievementBadge
              key={a.id}
              id={a.id}
              rarity={a.rarity}
              earned
              earnedAt={a.earnedAt}
              variant="circle"
              animated={false}
              className="size-9"
            />
          ))}
        </div>
      )}

      <div className="grid w-full grid-cols-2 gap-2">
        <ModalStat icon={FilmIcon} label={t("profile.summary.totalEpisodes")}>
          {profile.stats.episodesWatched}
        </ModalStat>
        <ModalStat icon={ClockIcon} label={t("profile.summary.totalTime")}>
          {fmtDuration(t, profile.stats.hoursWatched * 3600)}
        </ModalStat>
        <ModalStat icon={TrophyIcon} label={t("profile.rank.label")}>
          {t(`profile.rank.${profile.rank.toLowerCase()}` as "profile.rank.novice")}
        </ModalStat>
        <ModalStat icon={ThumbsUpIcon} label={t("profile.modal.commentLikes")}>
          {profile.commenterRank != null
            ? t("profile.modal.commenterRank", {
                likes: profile.totalCommentLikes,
                rank: profile.commenterRank,
                total: profile.totalRankedCommenters,
              })
            : profile.totalCommentLikes}
        </ModalStat>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        {t("profile.memberSince", { date: memberSince })}
      </p>
    </div>
  );
}

function ModalStat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 p-2.5 text-left">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3 shrink-0 text-muted-foreground/70" />
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}
