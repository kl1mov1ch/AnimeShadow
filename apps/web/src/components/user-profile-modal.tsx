import type { EarnedAchievement, PublicProfile, Rank } from "@animeshadow/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ClockIcon,
  EyeIcon,
  FilmIcon,
  HandshakeIcon,
  HeartIcon,
  LockIcon,
  type LucideIcon,
  MessageSquareHeartIcon,
  Share2Icon,
  SparklesIcon,
  TrophyIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fmtDuration } from "@/components/anime/progress-row";
import { ProMark } from "@/components/common/pro-mark";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { LevelBadge, LevelBar } from "@/components/profile/level-visuals";
import { useProfileAccentStyle } from "@/components/profile/profile-accent";
import { AvatarFrameRing, ProfileTitleBadge } from "@/components/profile/profile-cosmetics";
import { levelOf } from "@/components/profile/profile-level";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserTitleBadge } from "@/components/user-title-badge";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, displayTitle, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFollow, usePublicProfile, usePublicProfileById, useSocial } from "@/lib/query";
import { cn } from "@/lib/utils";

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

/**
 * Who the modal is open for — by username when the person has one,
 * otherwise by id. `preview` is what the opener already knows (a comment's
 * author): the name and face show at once, before anything loads.
 */
export type ProfileModalTarget = {
  id: string | null;
  username: string | null;
  preview?: { displayName: string; avatarUrl: string | null };
};

const STALE = 60_000;

/** Warms the modal's two requests — on hover or touch of a name or face. */
export function prefetchProfile(client: QueryClient, target: ProfileModalTarget) {
  if (target.username) {
    void client.prefetchQuery({
      queryKey: ["profile", target.username],
      queryFn: ({ signal }) => apiRequest<PublicProfile>(`/profile/${target.username}`, { signal }),
      staleTime: STALE,
    });
  } else if (target.id) {
    void client.prefetchQuery({
      queryKey: ["profile", "by-id", target.id],
      queryFn: ({ signal }) => apiRequest<PublicProfile>(`/users/${target.id}/public-profile`, { signal }),
      staleTime: STALE,
    });
  }
  if (target.id) {
    void client.prefetchQuery({
      queryKey: ["social", target.id],
      queryFn: ({ signal }) => apiRequest(`/users/${target.id}/social`, { signal }),
      staleTime: 30_000,
    });
  }
}

/** Spread on whatever opens the modal: the data is on its way before the click lands. */
export function useProfilePrefetch() {
  const client = useQueryClient();
  return (target: ProfileModalTarget) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      onPointerEnter: () => {
        timer = setTimeout(() => prefetchProfile(client, target), 90);
      },
      onPointerLeave: () => clearTimeout(timer),
      onTouchStart: () => prefetchProfile(client, target),
      onFocus: () => prefetchProfile(client, target),
    };
  };
}

/**
 * A person, previewed without leaving the page: their banner and colour,
 * face and level, how you're connected, their numbers in colour, the
 * showcase, the five and the genres — and follow / profile / share.
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
  const byId = usePublicProfileById(target && !target.username ? (target.id ?? undefined) : undefined);
  const { data, isError } = target?.username ? byUsername : byId;
  // In parallel with the profile, not after it: the id is usually known.
  const social = useSocial(target?.id ?? data?.id);

  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto overflow-x-hidden border-[color-mix(in_srgb,var(--primary)_30%,transparent)] p-0 sm:max-w-[34rem]">
        <DialogHeader className="sr-only">
          <DialogTitle>{data?.displayName ?? target?.preview?.displayName ?? t("profile.title")}</DialogTitle>
          <DialogDescription>{t("comments.viewProfile")}</DialogDescription>
        </DialogHeader>
        {data ? (
          <ProfileModalBody profile={data} social={social.data} onClose={() => onOpenChange(false)} />
        ) : isError ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("errors.genericTitle")}</p>
        ) : (
          <ModalLoading preview={target?.preview} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** While loading: the face and name already known, the rest as soft shapes. */
function ModalLoading({ preview }: { preview?: ProfileModalTarget["preview"] }) {
  return (
    <div className="flex flex-col">
      <Aurora className="h-28 sm:h-32" />
      <div className="-mt-12 flex items-end gap-4 px-5">
        <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 via-fuchsia-500/40 to-sky-500/40 font-display text-3xl text-white ring-4 ring-card">
          {preview?.avatarUrl ? <img src={imageSrc(preview.avatarUrl)} alt="" className="size-full object-cover" /> : (preview?.displayName ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pb-2">
          {preview ? <p className="truncate font-display text-2xl leading-tight">{preview.displayName}</p> : <Skeleton className="h-7 w-40" />}
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The colourful top when there's no banner (and under one, as it loads). */
function Aurora({ accent, className }: { accent?: string | null; className?: string }) {
  const c = accent ?? "var(--primary)";
  return (
    <div
      aria-hidden
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        background: `radial-gradient(70% 120% at 10% 0%, color-mix(in srgb, ${c} 70%, transparent), transparent 70%),
          radial-gradient(60% 110% at 90% 10%, color-mix(in srgb, #a855f7 55%, transparent), transparent 70%),
          radial-gradient(50% 100% at 55% 100%, color-mix(in srgb, #0ea5e9 40%, transparent), transparent 70%),
          var(--card)`,
      }}
    />
  );
}

const ONLINE: Record<string, { dot: string; label: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-400", label: "в сети", text: "text-emerald-500 dark:text-emerald-300" },
  DND: { dot: "bg-amber-400", label: "не беспокоить", text: "text-amber-500 dark:text-amber-300" },
  OFFLINE: { dot: "bg-muted-foreground/60", label: "не в сети", text: "text-muted-foreground" },
};

/** One hue per number, as on the account page — told apart at a glance. */
const TONES = {
  sky: "bg-sky-500/10 ring-sky-400/25 [--tone:#38bdf8]",
  violet: "bg-violet-500/10 ring-violet-400/25 [--tone:#a78bfa]",
  emerald: "bg-emerald-500/10 ring-emerald-400/25 [--tone:#34d399]",
  amber: "bg-amber-500/10 ring-amber-400/25 [--tone:#fbbf24]",
  rose: "bg-rose-500/10 ring-rose-400/25 [--tone:#fb7185]",
} as const;
type Tone = keyof typeof TONES;

const GENRE_TONES = [
  "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-200",
  "border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-200",
  "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-200",
  "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200",
  "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-200",
  "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-200",
];

function ProfileModalBody({
  profile,
  social,
  onClose,
}: {
  profile: PublicProfile;
  social: ReturnType<typeof useSocial>["data"];
  onClose: () => void;
}) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { status: authStatus, user } = useAuth();
  const style = useProfileAccentStyle(profile);
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
  const level = useMemo(() => levelOf(profile), [profile]);
  const closed = !own && profile.hidden.profile;
  const genres = !profile.hidden.stats ? profile.stats.topGenres.slice(0, 6) : [];

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

  const stats: Array<{ icon: LucideIcon; value: string | number; label: string; tone: Tone }> =
    !closed && !profile.hidden.stats
      ? [
          { icon: ClockIcon, value: fmtDuration(t, profile.stats.hoursWatched * 3600), label: "просмотрено", tone: "sky" },
          { icon: FilmIcon, value: profile.stats.episodesWatched, label: plural(profile.stats.episodesWatched, "серия", "серии", "серий"), tone: "violet" },
          { icon: CheckCheckIcon, value: profile.stats.titlesCompleted, label: "досмотрено", tone: "emerald" },
          ...(profile.hidden.achievements
            ? []
            : [{ icon: TrophyIcon, value: `${earned}/${profile.achievements.length}`, label: "достижений", tone: "amber" as const }]),
        ]
      : [];

  return (
    <div style={style} className="flex min-w-0 flex-col">
      {/* Top: the banner over the aurora, fading into the card. */}
      <div className="relative h-28 sm:h-32">
        <Aurora accent={profile.accentColor} className="absolute inset-0" />
        {profile.bannerUrl && (
          <img src={imageSrc(profile.bannerUrl)} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/25 to-transparent" />
      </div>

      <div className="relative -mt-14 flex min-w-0 flex-col gap-3.5 px-4 pb-5 sm:px-5">
        {/* Who: face with level and status, name, title, handle. */}
        <div className="flex items-end gap-3.5">
          <div className="relative shrink-0">
            <AvatarFrameRing frame={profile.avatarFrame} fallback={RANK_RING[profile.rank]}>
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/60 via-fuchsia-500/40 to-sky-500/40 font-display text-3xl text-white">
                {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
              </div>
            </AvatarFrameRing>
            <span className="absolute -bottom-1 -left-1">
              <LevelBadge info={level} size={34} animated={false} />
            </span>
            <span className={cn("absolute right-1 top-1 size-4 rounded-full ring-4 ring-card", online.dot)} title={online.label} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-1">
            <h2 className="flex min-w-0 items-center gap-1.5 font-display text-2xl leading-tight">
              <span className="min-w-0 truncate">{profile.displayName}</span>
              {profile.isPro && <ProMark />}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {profile.username && <span>@{profile.username}</span>}
              <span className={cn("inline-flex items-center gap-1 font-medium", online.text)}>
                <span className={cn("size-1.5 rounded-full", online.dot)} />
                {online.label}
              </span>
              <span>· с {memberSince}</span>
            </p>
          </div>
        </div>

        {(profile.profileTitle || profile.titlePrefix || friends || social?.followsYou) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ProfileTitleBadge title={profile.profileTitle} />
            <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
            {friends ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                <HandshakeIcon className="size-3" />
                Вы друзья
              </span>
            ) : social?.followsYou ? (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-300">Читает вас</span>
            ) : null}
          </div>
        )}

        {profile.bio && !closed && (
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">{profile.bio}</p>
        )}

        {/* Connections, each in its own colour. */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {social?.hidden ? (
            <Chip tone="text-muted-foreground bg-foreground/[0.05]" icon={LockIcon}>
              подписчики скрыты
            </Chip>
          ) : social ? (
            <>
              <Chip tone="bg-sky-500/10 text-sky-600 dark:text-sky-300" icon={UsersIcon}>
                <b className="tabular-nums">{social.followers}</b> {plural(social.followers, "подписчик", "подписчика", "подписчиков")}
              </Chip>
              <Chip tone="bg-violet-500/10 text-violet-600 dark:text-violet-300" icon={HeartIcon}>
                <b className="tabular-nums">{social.following}</b> {plural(social.following, "подписка", "подписки", "подписок")}
              </Chip>
              <Chip tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" icon={HandshakeIcon}>
                {social.friendFaces.length > 0 && (
                  <span className="flex -space-x-1.5">
                    {social.friendFaces.slice(0, 3).map((f) => (
                      <span key={f.id} className="grid size-4 place-items-center overflow-hidden rounded-full bg-muted text-[8px] font-semibold ring-1 ring-card">
                        {f.avatarUrl ? <img src={imageSrc(f.avatarUrl)} alt="" className="size-full object-cover" /> : f.displayName.charAt(0)}
                      </span>
                    ))}
                  </span>
                )}
                <b className="tabular-nums">{social.friends}</b> {plural(social.friends, "друг", "друга", "друзей")}
              </Chip>
            </>
          ) : (
            <Skeleton className="h-6 w-56 rounded-full" />
          )}
          {profile.views != null && (
            <Chip tone="bg-amber-500/10 text-amber-600 dark:text-amber-300" icon={EyeIcon}>
              <b className="tabular-nums">{profile.views}</b> {plural(profile.views, "просмотр", "просмотра", "просмотров")}
            </Chip>
          )}
        </div>

        {/* What to do. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          {own ? (
            <span className="inline-flex h-11 items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">Это вы</span>
          ) : authStatus !== "authenticated" ? (
            <Link
              to="/login"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-primary/25"
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
                  ? "border border-border/70 bg-background/40 text-foreground hover:border-rose-400/50 hover:text-rose-400"
                  : "bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-primary/25",
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
              <span className="hidden truncate sm:inline">Открыть профиль</span>
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

        {closed ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--accent-line-soft)] p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-muted-foreground">
              <LockIcon className="size-4" />
            </span>
            <p className="text-sm text-muted-foreground">Профиль скрыт владельцем — видно только имя и аватар. Подписаться можно.</p>
          </div>
        ) : (
          <>
            {/* The level, as on the account page. */}
            <div
              className="flex items-center gap-3 rounded-2xl p-3 ring-1"
              style={{
                background: `linear-gradient(110deg, color-mix(in srgb, ${level.tier.colors[0]} 16%, transparent), transparent 75%)`,
                ["--tw-ring-color" as string]: `color-mix(in srgb, ${level.tier.colors[0]} 30%, transparent)`,
              }}
            >
              <LevelBadge info={level} size={44} animated={false} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 font-display text-base leading-tight" style={{ color: level.tier.colors[0] }}>
                  {level.tier.name}
                  <span className="text-[11px] font-sans font-medium text-muted-foreground">{level.level} уровень</span>
                </p>
                <LevelBar info={level} labels={false} className="mt-1.5" />
              </div>
            </div>

            {stats.length > 0 && (
              <div className={cn("grid grid-cols-2 gap-2", stats.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
                {stats.map(({ icon: Icon, value, label, tone }) => (
                  <div key={label} className={cn("flex min-w-0 flex-col gap-0.5 rounded-2xl p-2.5 ring-1", TONES[tone])}>
                    <span className="grid size-6 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--tone)_20%,transparent)] text-[var(--tone)]">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="mt-1 truncate text-base font-bold tabular-nums">{value}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {profile.favorites.length > 0 && (
              <section className="flex flex-col gap-2">
                <Heading icon={HeartIcon} className="text-rose-400">{t("profile.blocks.showcase")}</Heading>
                <div className="grid grid-cols-5 gap-2">
                  {profile.favorites.map((anime, i) => (
                    <Link key={anime.id} to={animeHref(anime)} onClick={onClose} viewTransition title={displayTitle(anime)} className="group relative">
                      <span className="block aspect-[2/3] overflow-hidden rounded-xl bg-muted ring-1 ring-[var(--accent-line-soft)] transition-shadow group-hover:ring-2 group-hover:ring-primary">
                        {anime.imageUrl && (
                          <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        )}
                      </span>
                      <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-md bg-black/60 text-[11px] font-bold text-white backdrop-blur-sm">{i + 1}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {(pinned.length > 0 || genres.length > 0) && (
              <div className={cn("grid gap-3", pinned.length > 0 && genres.length > 0 && "sm:grid-cols-2")}>
                {pinned.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <Heading icon={TrophyIcon} className="text-amber-400">Витрина</Heading>
                    <div className="flex flex-wrap gap-2">
                      {pinned.map((a) => (
                        <HoloAchievementBadge key={a.id} id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" className="size-11" />
                      ))}
                    </div>
                  </section>
                )}
                {genres.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <Heading icon={SparklesIcon} className="text-violet-400">Любимые жанры</Heading>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g, i) => (
                        <span key={g.name} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", GENRE_TONES[i % GENRE_TONES.length])}>
                          {labels.genreLabel(g.name)}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {profile.commenterRank != null && (
              <p className="flex items-center gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 text-xs text-muted-foreground">
                <MessageSquareHeartIcon className="size-4 shrink-0 text-primary" />
                <span>
                  <b className="text-foreground">{profile.totalCommentLikes}</b>{" "}
                  {plural(profile.totalCommentLikes, "лайк", "лайка", "лайков")} за комментарии ·{" "}
                  <b className="text-foreground">№{profile.commenterRank}</b> из {profile.totalRankedCommenters} комментаторов
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ tone, icon: Icon, children }: { tone: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", tone)}>
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

function Heading({ icon: Icon, className, children }: { icon: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className={cn("size-3.5", className)} />
      {children}
    </span>
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
