import type { EarnedAchievement, PublicProfile, Rank } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ClockIcon,
  FilmIcon,
  HandshakeIcon,
  Share2Icon,
  ThumbsUpIcon,
  TrophyIcon,
  UserCheckIcon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
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
import { useFollow, usePublicProfile, usePublicProfileById, useSocial } from "@/lib/query";
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto overflow-x-hidden border-[color-mix(in_srgb,var(--primary)_25%,transparent)] p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{data?.displayName ?? t("profile.title")}</DialogTitle>
          <DialogDescription>{t("comments.viewProfile")}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="-mt-12 flex items-end gap-3 px-5">
              <Skeleton className="size-24 rounded-full" />
              <Skeleton className="mb-2 h-6 w-40" />
            </div>
            <div className="grid grid-cols-4 gap-2 px-5 pb-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : isError || !data ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t("errors.genericTitle")}
          </p>
        ) : (
          <ProfileModalBody profile={data} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const ONLINE: Record<string, { dot: string; label: string }> = {
  ONLINE: { dot: "bg-emerald-400", label: "в сети" },
  DND: { dot: "bg-amber-400", label: "не беспокоить" },
  OFFLINE: { dot: "bg-muted-foreground/60", label: "не в сети" },
};

/**
 * A person, previewed: their own banner, colour and frame; who they are
 * (name, PRO, title, nick tag, handle, status); how they relate to you
 * and how many follow them; their level, numbers, pinned achievements,
 * favourite five and genres — and three things to do: follow, open the
 * full profile, share it.
 */
function ProfileModalBody({ profile, onClose }: { profile: PublicProfile; onClose: () => void }) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { status: authStatus, user } = useAuth();
  const style = useProfileAccentStyle(profile);
  const { data: social } = useSocial(profile.id);
  const follow = useFollow(profile.id);
  const own = user?.id === profile.id;
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const memberSince = new Date(profile.memberSince).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a): a is EarnedAchievement => a != null);
  const earned = profile.achievements.filter((a) => a.earned).length;
  const href = profile.username ? `/profile/${profile.username}` : null;
  const online = ONLINE[profile.onlineStatus] ?? ONLINE.OFFLINE!;
  const friends = Boolean(social?.isFollowing && social.followsYou);

  const share = async () => {
    const url = href ? `${window.location.origin}${href}` : window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${profile.displayName} на AnimeShadow`, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка на профиль скопирована");
    } catch {
      toast.error("Не получилось скопировать", { description: url });
    }
  };

  const stats = !profile.hidden.stats
    ? [
        { icon: ClockIcon, value: fmtDuration(t, profile.stats.hoursWatched * 3600), label: "смотрел" },
        { icon: FilmIcon, value: profile.stats.episodesWatched, label: "серий" },
        { icon: CheckCheckIcon, value: profile.stats.titlesCompleted, label: "досмотрено" },
        { icon: TrophyIcon, value: `${earned}/${profile.achievements.length}`, label: "достижений" },
      ]
    : [];

  return (
    <div style={style} className="flex min-w-0 flex-col">
      <div className="relative">
        <ProfileBanner url={profile.bannerUrl} accent={profile.accentColor} className="h-36 w-full sm:h-40" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="relative -mt-16 flex min-w-0 flex-col gap-4 px-4 pb-5 sm:px-6">
        <div className="flex items-end gap-4">
          <div className="relative shrink-0">
            <AvatarFrameRing frame={profile.avatarFrame} fallback={RANK_RING[profile.rank]}>
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 via-fuchsia-500/40 to-sky-500/40 font-display text-3xl text-white sm:size-28">
                {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
              </div>
            </AvatarFrameRing>
            <span className={cn("absolute bottom-1.5 right-1.5 size-4 rounded-full ring-4 ring-background", online.dot)} title={online.label} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-1">
            <h2 className="flex min-w-0 items-center gap-1.5 font-display text-2xl leading-tight [overflow-wrap:anywhere]">
              <span className="min-w-0 truncate">{profile.displayName}</span>
              {profile.isPro && <ProMark />}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {profile.username && <span>@{profile.username}</span>}
              <span className="inline-flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", online.dot)} />
                {online.label}
              </span>
              <span>с {memberSince}</span>
            </p>
          </div>
        </div>

        {(profile.profileTitle || profile.titlePrefix || friends || social?.followsYou) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ProfileTitleBadge title={profile.profileTitle} />
            <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
            {friends ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                <HandshakeIcon className="size-3" />
                Вы друзья
              </span>
            ) : social?.followsYou ? (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">Читает вас</span>
            ) : null}
          </div>
        )}

        {profile.bio && <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">{profile.bio}</p>}

        {/* Followers, following, friends — with a few friends' faces. */}
        {social && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span>
              <b className="tabular-nums">{social.followers}</b> <span className="text-muted-foreground">{plural(social.followers, "подписчик", "подписчика", "подписчиков")}</span>
            </span>
            <span>
              <b className="tabular-nums">{social.following}</b> <span className="text-muted-foreground">{plural(social.following, "подписка", "подписки", "подписок")}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              {social.friendFaces.length > 0 && (
                <span className="flex -space-x-2">
                  {social.friendFaces.slice(0, 4).map((f) => (
                    <span key={f.id} className="grid size-6 place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background">
                      {f.avatarUrl ? <img src={imageSrc(f.avatarUrl)} alt="" className="size-full object-cover" /> : f.displayName.charAt(0)}
                    </span>
                  ))}
                </span>
              )}
              <b className="tabular-nums">{social.friends}</b> <span className="text-muted-foreground">{plural(social.friends, "друг", "друга", "друзей")}</span>
            </span>
          </div>
        )}

        {/* What to do: follow, the full profile, share. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          {own ? (
            <span className="inline-flex h-11 items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">Это вы</span>
          ) : authStatus !== "authenticated" ? (
            <Link
              to="/login"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-fuchsia-500 text-sm font-bold text-white"
            >
              <UserPlusIcon className="size-4" />
              Подписаться
            </Link>
          ) : (
            <button
              type="button"
              disabled={follow.isPending || !social}
              onClick={() => follow.mutate(!social?.isFollowing)}
              className={cn(
                "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-[transform,background-color] active:scale-95 disabled:opacity-60",
                social?.isFollowing
                  ? "border border-border/70 bg-background/40 text-foreground hover:border-rose-400/50 hover:text-rose-300"
                  : "bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-primary/30",
              )}
            >
              {social?.isFollowing ? <UserCheckIcon className="size-4" /> : <UserPlusIcon className="size-4" />}
              <span className="truncate">
                {social?.isFollowing ? (friends ? "Друзья" : "Вы подписаны") : social?.followsYou ? "В ответ" : "Подписаться"}
              </span>
            </button>
          )}
          {href ? (
            <Link
              to={href}
              viewTransition
              onClick={onClose}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-primary/10 px-2 text-sm font-semibold transition-colors hover:bg-primary/20"
            >
              <span className="truncate sm:hidden">Профиль</span>
              <span className="hidden truncate sm:inline">{t("profile.modal.open")}</span>
              <ArrowRightIcon className="size-4 shrink-0" />
            </Link>
          ) : (
            <span className="inline-flex h-11 items-center justify-center rounded-xl border border-border/50 px-2 text-center text-[11px] text-muted-foreground">
              Профиль без ника
            </span>
          )}
          <button
            type="button"
            onClick={() => void share()}
            aria-label="Поделиться профилем"
            className="grid size-11 place-items-center rounded-xl border border-border/70 transition-colors hover:border-foreground/30"
          >
            <Share2Icon className="size-4" />
          </button>
        </div>

        {!profile.hidden.stats && <ProfileProgress profile={profile} className="w-full" />}

        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3">
                <Icon className="size-4 text-primary" />
                <span className="mt-1 truncate text-base font-semibold tabular-nums">{value}</span>
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}

        {pinned.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Витрина достижений</span>
            <div className="flex flex-wrap gap-2.5">
              {pinned.map((a) => (
                <HoloAchievementBadge key={a.id} id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" className="size-12" />
              ))}
            </div>
          </div>
        )}

        {profile.favorites.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("profile.blocks.showcase")}</span>
            <div className="grid grid-cols-5 gap-2">
              {profile.favorites.map((anime, i) => (
                <Link key={anime.id} to={animeHref(anime)} onClick={onClose} viewTransition title={displayTitle(anime)} className="group relative">
                  <span className="block aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-[var(--accent-line-soft)] transition-shadow group-hover:ring-primary">
                    {anime.imageUrl && (
                      <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    )}
                  </span>
                  <span className="absolute left-1.5 top-0.5 font-display text-lg text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">{i + 1}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!profile.hidden.stats && profile.stats.topGenres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.stats.topGenres.slice(0, 6).map((g) => (
              <span key={g.name} className="rounded-full border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-foreground/85">
                {labels.genreLabel(g.name)}
              </span>
            ))}
          </div>
        )}

        {profile.commenterRank != null && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ThumbsUpIcon className="size-3.5 text-primary" />
            {t("profile.modal.commenterRank", { likes: profile.totalCommentLikes, rank: profile.commenterRank, total: profile.totalRankedCommenters })}
          </p>
        )}
      </div>
    </div>
  );
}

/** 1 подписчик, 2 подписчика, 5 подписчиков. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
