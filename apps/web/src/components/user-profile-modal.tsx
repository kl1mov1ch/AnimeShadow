import type { EarnedAchievement, PublicProfile, Rank } from "@animeshadow/shared";
import { ArrowRightIcon, ClockIcon, FilmIcon, ThumbsUpIcon, TrophyIcon } from "lucide-react";
import { Link } from "react-router-dom";
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
import { animeHref, displayTitle, imageSrc } from "@/lib/format";
import { usePublicProfile, usePublicProfileById } from "@/lib/query";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProMark } from "@/components/common/pro-mark";
import { useProfileAccentStyle } from "@/components/profile/profile-accent";
import { AvatarFrameRing, ProfileTitleBadge } from "@/components/profile/profile-cosmetics";
import { ProfileProgress } from "@/components/profile/profile-progress";
import { useLabels } from "@/lib/labels";

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
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden p-0 sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{data?.displayName ?? t("profile.title")}</DialogTitle>
          <DialogDescription>{t("comments.viewProfile")}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError || !data ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
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
  const labels = useLabels();
  const { locale } = useLocale();
  const style = useProfileAccentStyle(profile);
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
  const earned = profile.achievements.filter((a) => a.earned).length;
  const href = profile.username ? `/profile/${profile.username}` : null;

  return (
    // A small copy of the profile page, not a different card: the owner's
    // colour, frame, title and progress bar, so the person you open from a
    // comment looks like the person you'd find on their page.
    <div style={style} className="flex flex-col">
      <div className="relative">
        <ProfileBanner url={profile.bannerUrl} accent={profile.accentColor} className="h-32 w-full" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      <div className="relative -mt-14 flex flex-col items-center gap-3 px-5 pb-5 text-center">
        <AvatarFrameRing frame={profile.avatarFrame} fallback={RANK_RING[profile.rank]}>
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-card font-display text-2xl">
            {profile.avatarUrl ? (
              <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </div>
        </AvatarFrameRing>

        <div className="flex flex-col items-center gap-1.5">
          <h2 className="flex items-center gap-1.5 text-xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">
            <span className="min-w-0">{profile.displayName}</span>
            {profile.isPro && <ProMark />}
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <ProfileTitleBadge title={profile.profileTitle} />
            <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
          </div>
          {profile.username && (
            <p className="text-xs text-muted-foreground">{t("profile.handle", { username: profile.username })}</p>
          )}
        </div>

        {profile.bio && (
          <p className="line-clamp-3 max-w-[24rem] text-sm leading-relaxed text-foreground/85">{profile.bio}</p>
        )}

        {!profile.hidden.stats && <ProfileProgress profile={profile} className="w-full text-left" />}

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
                className="size-11"
              />
            ))}
          </div>
        )}

        {!profile.hidden.stats && (
          <div className="grid w-full grid-cols-2 gap-2">
            <ModalStat icon={FilmIcon} label={t("profile.summary.totalEpisodes")}>
              {profile.stats.episodesWatched}
            </ModalStat>
            <ModalStat icon={ClockIcon} label={t("profile.summary.totalTime")}>
              {fmtDuration(t, profile.stats.hoursWatched * 3600)}
            </ModalStat>
            <ModalStat icon={TrophyIcon} label={t("profile.tabs.achievements")}>
              {earned} / {profile.achievements.length}
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
        )}

        {profile.favorites.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("profile.blocks.showcase")}
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {profile.favorites.map((anime, i) => (
                <Link
                  key={anime.id}
                  to={animeHref(anime)}
                  viewTransition
                  title={displayTitle(anime)}
                  className="group relative"
                >
                  <span className="block aspect-[2/3] overflow-hidden rounded-lg border border-primary/30 transition-colors group-hover:border-primary">
                    {anime.imageUrl && (
                      <img
                        src={imageSrc(anime.imageUrl)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </span>
                  <span className="absolute left-1 top-0 font-display text-lg text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                    {i + 1}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!profile.hidden.stats && profile.stats.topGenres.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {profile.stats.topGenres.slice(0, 5).map((g) => (
              <span
                key={g.name}
                className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {labels.genreLabel(g.name)}
              </span>
            ))}
          </div>
        )}

        <div className="flex w-full items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground/70">{t("profile.memberSince", { date: memberSince })}</span>
          {href && (
            <Link
              to={href}
              viewTransition
              className="btn-sheen inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-95"
            >
              {t("profile.modal.open")}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
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
    <div className="group flex flex-col gap-1 rounded-2xl border border-border/60 bg-card/40 p-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3 shrink-0 text-primary/70 transition-transform duration-300 group-hover:scale-110" />
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}
