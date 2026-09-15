import type {
  EarnedAchievement,
  MyProfile,
  ProfileStats,
  ProgressDetail,
  PublicProfile,
  Rank,
  TitleIcon,
} from "@animeshadow/shared";
import { MAX_SHOWCASE_ACHIEVEMENTS, TITLE_ICONS } from "@animeshadow/shared";
import { type CSSProperties, useRef, useState } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ClockIcon,
  FilmIcon,
  LinkIcon,
  Loader2Icon,
  PencilIcon,
  PlayCircleIcon,
  SettingsIcon,
  ShuffleIcon,
  SparklesIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  fmtDuration,
  mmss,
  ProgressEmpty,
  ProgressRow,
} from "@/components/anime/progress-row";
import { TITLE_ICON_COMPONENT, UserTitleBadge } from "@/components/user-title-badge";
import { PasswordInput, TextInput } from "@/components/auth/auth-card";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useLocale, useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useAchievements,
  useDeleteAccount,
  useDeleteProgress,
  useGenrePreferencesStatus,
  useGenres,
  useMyProfile,
  useMyProgress,
  usePublicProfile,
  useResendVerification,
  useSetGenrePreferences,
  useSetRandomAvatar,
  useSetUsername,
  useUpdateProfile,
  useUploadAvatar,
  useVerifyEmail,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const ACCENTS = [
  "#ff4d6d", "#f97316", "#facc15", "#4ade80", "#22d3ee", "#60a5fa",
  "#a78bfa", "#f472b6", "#fb7185", "#34d399", "#818cf8", "#e879f9",
];

export function Component() {
  const t = useT();
  const { username } = useParams();
  const { status } = useAuth();

  if (username) return <PublicView username={username.replace(/^@/, "")} />;

  if (status === "loading") return <ProfileSkeleton />;
  if (status !== "authenticated") {
    return (
      <ProfileShell>
        <EmptyState
          title={t("profile.signedOut.title")}
          description={t("profile.signedOut.body")}
          action={
            <Button asChild>
              <Link to="/login">{t("profile.signedOut.cta")}</Link>
            </Button>
          }
        />
      </ProfileShell>
    );
  }
  return <OwnView />;
}

/**
 * One page container for every profile view — public and own alike — so both
 * read as the same surface at the same width and vertical rhythm.
 */
function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
      {children}
    </div>
  );
}

function PublicView({ username }: { username: string }) {
  const t = useT();
  const { data, isPending, isError } = usePublicProfile(username);
  if (isPending) return <ProfileSkeleton />;
  if (isError || !data)
    return <ErrorState title={t("errors.notFoundTitle")} message={t("errors.notFoundBody")} />;
  return (
    <ProfileShell>
      <ProfileHero profile={data} />
      <ProfileOverview stats={data.stats} />
      <AchievementsGrid achievements={data.achievements} />
    </ProfileShell>
  );
}

const PROFILE_TABS = ["progress", "settings", "achievements"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function OwnView() {
  const t = useT();
  const { data: profile, isPending } = useMyProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: ProfileTab = PROFILE_TABS.includes(requested as ProfileTab)
    ? (requested as ProfileTab)
    : "progress";

  if (isPending || !profile) return <ProfileSkeleton />;

  return (
    <ProfileShell>
      <ProfileHero profile={profile} />
      <ProfileOverview stats={profile.stats} />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setSearchParams(v === "progress" ? {} : { tab: v }, { replace: true })
        }
        className="gap-5"
      >
        {/* The page's primary navigation — it separates the profile overview
            above from whatever section the user is actually working in. */}
        <TabsList className="h-auto! w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ProfileTabTrigger
            value="progress"
            icon={PlayCircleIcon}
            label={t("profile.tabs.progress")}
          />
          <ProfileTabTrigger
            value="settings"
            icon={SettingsIcon}
            label={t("profile.tabs.settings")}
          />
          <ProfileTabTrigger
            value="achievements"
            icon={TrophyIcon}
            label={t("profile.tabs.achievements")}
          />
        </TabsList>

        <TabsContent value="progress">
          <ProgressTab stats={profile.stats} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab profile={profile} />
        </TabsContent>
        <TabsContent value="achievements">
          <AchievementsTab />
        </TabsContent>
      </Tabs>
    </ProfileShell>
  );
}

function ProfileTabTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: ProfileTab;
  icon: typeof PlayCircleIcon;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-auto flex-none gap-2 rounded-lg border-transparent px-3.5 py-2 sm:px-4 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-primary dark:data-[state=active]:border-primary/30 dark:data-[state=active]:bg-primary/15 dark:data-[state=active]:text-primary"
    >
      <Icon className="size-4" />
      {label}
    </TabsTrigger>
  );
}

/* ---------------- hero ---------------- */

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

const RANK_DOT: Record<Rank, string> = {
  NOVICE: "bg-muted-foreground/60",
  ADVANCED: "bg-emerald-500",
  EXPERT: "bg-sky-500",
  LEGEND: "bg-amber-400",
};

/**
 * Avatar anchors the block, the name is the loudest thing on the page, and
 * rank/PRO live in their own labelled rail on the right instead of trailing
 * the name as a row of look-alike badges.
 */
function ProfileHero({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const memberSince = new Date(profile.memberSince).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // Order preserved server-side (first = leftmost); only ever contains ids
  // the user has actually earned (re-checked on every profile read).
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a): a is EarnedAchievement => a != null);
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);

  return (
    <>
    <header className="reveal-group flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <div
        className={cn(
          "reveal flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-display text-2xl ring-2 ring-offset-4 ring-offset-background sm:size-24 sm:text-3xl",
          RANK_RING[profile.rank],
        )}
        style={{ "--i": 0 } as CSSProperties}
      >
        {profile.avatarUrl ? (
          <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </div>

      <div
        className="reveal flex min-w-0 flex-1 flex-col gap-1.5"
        style={{ "--i": 1 } as CSSProperties}
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h1 className="font-display text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">
            {profile.displayName}
          </h1>
          <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
        </div>
        {profile.username && (
          <p className="truncate text-sm text-muted-foreground">
            {t("profile.handle", { username: profile.username })}
          </p>
        )}
        {/* Bio shares its line with the pinned achievements instead of its
            own row — truncated to one line (it already can't be wider than
            the name/handle above it, all being siblings in the same column)
            so a long bio can't push the achievement circles off-screen. */}
        {(profile.bio || pinned.length > 0) && (
          <div className="flex items-center gap-2">
            {profile.bio && (
              <p className="min-w-0 flex-1 truncate text-sm leading-relaxed text-foreground/90">
                {profile.bio}
              </p>
            )}
            {pinned.length > 0 && (
              <div className="flex shrink-0 items-center gap-1.5">
                {pinned.map((a) => (
                  <HoloAchievementBadge
                    key={a.id}
                    id={a.id}
                    rarity={a.rarity}
                    earned
                    earnedAt={a.earnedAt}
                    variant="circle"
                    className="size-8"
                    onClick={() => setOpened(a)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground/80">
          {t("profile.memberSince", { date: memberSince })}
        </p>
      </div>

      <div
        className="reveal flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2.5 sm:self-stretch sm:border-l sm:border-border/60 sm:pl-6"
        style={{ "--i": 2 } as CSSProperties}
      >
        <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", RANK_DOT[profile.rank])}
          />
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {t("profile.rank.label")}
            </span>
            <span className="text-xs font-medium">
              {t(`profile.rank.${profile.rank.toLowerCase()}`)}
            </span>
          </span>
        </div>
        {profile.isPro && (
          <span className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold tracking-wide text-primary">
            <SparklesIcon className="size-3.5" />
            PRO
          </span>
        )}
      </div>
    </header>
    <AchievementDetailDialog
      achievement={opened}
      onOpenChange={(open) => !open && setOpened(null)}
    />
    </>
  );
}

/* ---------------- overview (stats + genres) ---------------- */

function ProfileOverview({ stats }: { stats: ProfileStats }) {
  return (
    <section className="flex flex-col gap-3">
      <StatsGrid stats={stats} />
      <TopGenres genres={stats.topGenres} />
    </section>
  );
}

function StatsGrid({ stats }: { stats: ProfileStats }) {
  const t = useT();
  const { locale } = useLocale();
  const day = stats.mostProductiveDay
    ? new Date(stats.mostProductiveDay).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
      })
    : "—";

  const cards: Array<{ icon: typeof ClockIcon; label: string; value: string }> = [
    {
      icon: FilmIcon,
      label: t("profile.summary.totalEpisodes"),
      value: String(stats.episodesWatched),
    },
    {
      icon: ClockIcon,
      label: t("profile.summary.totalTime"),
      value: fmtDuration(t, stats.hoursWatched * 3600),
    },
    {
      icon: CalendarDaysIcon,
      label: t("profile.summary.mostProductiveDay"),
      value: day,
    },
    {
      icon: TimerIcon,
      label: t("profile.summary.avgPerSession"),
      value:
        stats.avgSessionMinutes != null
          ? t("profile.summary.minutesShort", { minutes: stats.avgSessionMinutes })
          : "—",
    },
  ];

  return (
    <div className="reveal-group grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, value }, i) => (
        <div
          key={label}
          className="reveal flex h-full flex-col justify-between gap-2 rounded-xl border border-border/60 bg-card/40 p-4"
          style={{ "--i": i } as CSSProperties}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{label}</span>
          </span>
          <span className="font-display text-lg leading-tight tabular-nums sm:text-xl">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopGenres({ genres }: { genres: ProfileStats["topGenres"] }) {
  const t = useT();
  const labels = useLabels();
  if (genres.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {t("profile.summary.topGenres")}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {genres.map((g) => (
          <Link
            key={g.name}
            to={`/browse?q=${encodeURIComponent(g.name)}`}
            className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {labels.genreLabel(g.name)} · {g.count}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{hint}</span>}
    </div>
  );
}

/* ---------------- progress tab ---------------- */

function ProgressTab({ stats }: { stats: ProfileStats }) {
  const t = useT();
  const { data, isPending } = useMyProgress();
  const deleteProgress = useDeleteProgress();
  const rows = data ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        <SectionHeading
          title={t("home.continueRail")}
          hint={isPending ? undefined : t("library.countTracked", { count: rows.length })}
        />
        {isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <ProgressEmpty />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <ProgressRow
                key={row.animeId}
                row={row}
                deleting={
                  deleteProgress.isPending && deleteProgress.variables === row.animeId
                }
                onDelete={() =>
                  deleteProgress.mutate(row.animeId, {
                    onSuccess: () => toast.success(t("profile.progressCard.deleted")),
                    onError: () => toast.error(t("errors.genericTitle")),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-44 rounded-xl" />
      ) : (
        <ProgressSummary rows={rows} stats={stats} />
      )}
    </div>
  );
}

/**
 * Side rail for the progress tab — deliberately shows only what the four
 * stat cards above *don't* (titles finished, mean score, last session), so
 * the same numbers never appear twice on one screen.
 */
function ProgressSummary({
  rows,
  stats,
}: {
  rows: ProgressDetail[];
  stats: ProfileStats;
}) {
  const t = useT();
  const labels = useLabels();
  const inProgress = rows.filter((r) => !r.completed).length;
  const lastWatched = rows[0]?.lastWatchedAt
    ? labels.formatDate(rows[0]!.lastWatchedAt)
    : null;

  const items: Array<[string, string]> = [
    [t("profile.summary.inProgress"), String(inProgress)],
    [t("profile.summary.completedTitles"), String(stats.titlesCompleted)],
  ];
  if (stats.meanScore != null) {
    items.push([
      t("profile.summary.meanScore"),
      t("library.scoreValue", { value: stats.meanScore }),
    ]);
  }
  if (lastWatched) {
    items.push([t("profile.summary.lastWatched"), lastWatched]);
  }

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 lg:sticky lg:top-20">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("profile.tabs.progress")}
      </h3>
      <dl className="flex flex-col gap-2.5">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
            <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}


/* ---------------- settings tab ---------------- */

function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base">{title}</h2>
        {description && (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function SettingsLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

function SettingsTab({ profile }: { profile: MyProfile }) {
  const t = useT();
  const { setTheme, theme } = useTheme();
  const { updateUser } = useAuth();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const randomAvatar = useSetRandomAvatar();
  const setUsername = useSetUsername();
  const { data: achievements } = useAchievements();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState(profile.bio ?? "");
  const [statusValue, setStatusValue] = useState(profile.onlineStatus);
  const [accent, setAccent] = useState(profile.accentColor ?? "");
  const [uname, setUname] = useState(profile.username ?? "");

  const earned = (achievements ?? []).filter((a) => a.earned);

  const onFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile.settings.fileTooLarge"));
      return;
    }
    const dataUrl = await cropToSquareDataUrl(file);
    uploadAvatar.mutate(dataUrl, {
      onSuccess: (res) => {
        toast.success(t("common.save"));
        // The header's avatar comes from the lightweight auth session, not
        // the profile query — patch it directly so it updates immediately.
        updateUser({ avatarUrl: res.avatarUrl });
      },
    });
  };

  const onRandomAvatar = () => {
    randomAvatar.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(t("profile.settings.avatarRandomDone"));
        updateUser({ avatarUrl: res.avatarUrl });
      },
      onError: () => toast.error(t("errors.genericTitle")),
    });
  };

  const applyAccent = (hex: string) => {
    setAccent(hex);
    try {
      if (hex) document.documentElement.style.setProperty("--primary", hex);
      else document.documentElement.style.removeProperty("--primary");
      localStorage.setItem("animeshadow.accent", hex);
    } catch {
      /* ignore */
    }
    update.mutate({ accentColor: hex || null });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* identity: avatar + username + bio in one place */}
        <SettingsSection title={t("profile.title")}>
          <div className="flex items-start gap-4">
            {/* Two ways to have an avatar, not just one: your own photo, or
                a fresh anime reaction gif on demand (the same pool new
                accounts get one from automatically) — a shuffle badge next
                to the upload button instead of only offering the file
                picker. */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadAvatar.isPending || randomAvatar.isPending}
                aria-label={t("profile.settings.avatarUpload")}
                className="group relative size-20 overflow-hidden rounded-full bg-muted disabled:opacity-60"
              >
                {profile.avatarUrl ? (
                  <img
                    src={imageSrc(profile.avatarUrl)}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center font-display text-2xl">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Pencil overlay — always visible on touch, fades in on hover for mouse users. */}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1.5 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {uploadAvatar.isPending ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <PencilIcon className="size-3.5" />
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={onRandomAvatar}
                disabled={uploadAvatar.isPending || randomAvatar.isPending}
                aria-label={t("profile.settings.avatarRandom")}
                title={t("profile.settings.avatarRandom")}
                className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-60"
              >
                {randomAvatar.isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <ShuffleIcon className="size-3.5" />
                )}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SettingsLabel>{t("profile.settings.username")}</SettingsLabel>
              {/* flex-wrap so a long "copy link" label never fights the
                  input for space on a narrow phone — it just drops to its
                  own line instead of forcing the row wider than the screen. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={uname}
                  onChange={(e) =>
                    setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  maxLength={20}
                  disabled={Boolean(profile.username)}
                  placeholder={t("profile.settings.usernamePlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
                {profile.username ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(
                          `${window.location.origin}/profile/@${profile.username}`,
                        )
                        .then(() => toast.success(t("seo.linkCopied")))
                        .catch(() => undefined);
                    }}
                  >
                    <LinkIcon />
                    <span className="hidden sm:inline">
                      {t("profile.settings.copyProfileLink")}
                    </span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={setUsername.isPending || uname.length < 3}
                    onClick={() =>
                      setUsername.mutate(uname, {
                        onSuccess: () =>
                          toast.success(t("profile.settings.usernameSet")),
                        onError: (e) =>
                          toast.error(
                            e instanceof Error ? e.message : t("errors.genericTitle"),
                          ),
                      })
                    }
                  >
                    {t("profile.settings.save")}
                  </Button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t("profile.settings.usernameHint")}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SettingsLabel>{t("profile.settings.bio")}</SettingsLabel>
            <textarea
              value={bio}
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="🔥 …"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground/80">
                {bio.length}/500 · {t("profile.settings.bioHint")}
              </span>
              <Button
                size="sm"
                disabled={update.isPending || bio === (profile.bio ?? "")}
                onClick={() => update.mutate({ bio: bio || null })}
              >
                {t("profile.settings.save")}
              </Button>
            </div>
          </div>
        </SettingsSection>

        <div className="flex flex-col gap-5">
          <SettingsSection title={t("profile.settings.appearance")}>
            <div className="flex flex-col gap-1.5">
              <SettingsLabel>{t("profile.settings.theme")}</SettingsLabel>
              <Select
                value={theme ?? "system"}
                onValueChange={(value) => {
                  setTheme(value);
                  // Saved to the account, not just this browser — so it
                  // follows the user to a new device (see ThemeSync).
                  update.mutate({ theme: value as "light" | "dark" | "system" });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("profile.settings.themeLight")}</SelectItem>
                  <SelectItem value="dark">{t("profile.settings.themeDark")}</SelectItem>
                  <SelectItem value="system">{t("profile.settings.themeAuto")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <SettingsLabel>{t("profile.settings.accentColor")}</SettingsLabel>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => applyAccent(hex)}
                    aria-label={hex}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                      accent === hex ? "ring-2 ring-foreground" : "hover:scale-110",
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                {accent && (
                  <button
                    type="button"
                    onClick={() => applyAccent("")}
                    className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("common.cancel")}
                  </button>
                )}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title={t("profile.settings.status")}>
            <Select
              value={statusValue}
              onValueChange={(v) => {
                setStatusValue(v as MyProfile["onlineStatus"]);
                update.mutate({ onlineStatus: v as MyProfile["onlineStatus"] });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONLINE">{t("profile.presence.online")}</SelectItem>
                <SelectItem value="OFFLINE">{t("profile.presence.offline")}</SelectItem>
                <SelectItem value="DND">{t("profile.presence.dnd")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsSection>

          <AgeVerificationSection profile={profile} update={update} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {(earned.length > 0 || profile.isPro) && (
          <SettingsSection
            title={t("profile.settings.showcase")}
            description={t("profile.settings.showcaseHint")}
          >
            {earned.length > 0 && (
              <ShowcaseChips profile={profile} update={update} earned={earned} />
            )}
            {profile.isPro && (
              <>
                {earned.length > 0 && <div className="h-px bg-border/60" />}
                <TitleEditor profile={profile} update={update} />
              </>
            )}
          </SettingsSection>
        )}

        <SettingsSection
          title={t("profile.settings.genres")}
          description={t("profile.settings.genresHint")}
        >
          <GenrePreferencesSection />
        </SettingsSection>
      </div>

      <EmailVerificationSection />

      <DeleteAccountSection profile={profile} />
    </div>
  );
}

/**
 * Only for accounts created before signup itself required a code — every
 * newer account is verified the moment it exists. Telegram accounts have no
 * inbox behind them, so they never see this.
 */
function EmailVerificationSection() {
  const t = useT();
  const { user, updateUser } = useAuth();
  const resend = useResendVerification();
  const verify = useVerifyEmail();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  if (!user || user.emailVerified || user.isTelegramLinked) return null;

  const sendCode = () => {
    resend.mutate(undefined, {
      onSuccess: () => setSent(true),
      onError: (err) =>
        toast.error(err instanceof ApiRequestError ? err.message : t("auth.genericError")),
    });
  };

  const submit = (value: string) => {
    setError(undefined);
    verify.mutate(value, {
      onSuccess: (res) => {
        updateUser({ emailVerified: res.user.emailVerified });
        toast.success(t("auth.verifyEmail.success"));
      },
      onError: (err) => {
        setError(
          err instanceof ApiRequestError && err.code === "INVALID_CODE"
            ? t("auth.verifyEmail.invalidCode")
            : t("auth.genericError"),
        );
        setCode("");
      },
    });
  };

  return (
    <SettingsSection
      title={t("profile.settings.emailVerification.title")}
      description={t("profile.settings.emailVerification.hint", { email: user.email })}
      className="border-primary/40"
    >
      {sent ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-muted-foreground">
            {t("profile.settings.emailVerification.sent")}
          </p>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submit}
            disabled={verify.isPending}
            {...(error ? { error } : {})}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={resend.isPending}
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-primary disabled:opacity-60"
          >
            {t("auth.verifyEmail.resend")}
          </button>
        </div>
      ) : (
        <Button onClick={sendCode} disabled={resend.isPending} className="self-start">
          {resend.isPending && <Spinner data-icon="inline-start" />}
          {t("profile.settings.emailVerification.send")}
        </Button>
      )}
    </SettingsSection>
  );
}

/** Words a confirmation phrase is drawn from — proper nouns, not sentences,
 * so they read the same regardless of site language rather than needing
 * their own i18n. Regenerated (word + 4 random digits) every time the
 * dialog opens, so it can't be muscle-memorised across attempts. */
const CONFIRM_WORDS = [
  "shadow",
  "sakura",
  "katana",
  "kitsune",
  "ronin",
  "yokai",
  "senpai",
  "tanuki",
];

function generateConfirmPhrase(): string {
  const word = CONFIRM_WORDS[Math.floor(Math.random() * CONFIRM_WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${digits}`;
}

/**
 * The very last thing in Settings, deliberately: a destructive action with
 * two independent guards — a freshly-generated phrase that has to be typed
 * exactly (so a reflexive double-click can't trigger it) and the actual
 * account password (so a merely-valid bearer token isn't enough on its
 * own). A Telegram-only account has no password to ask for — see
 * `isTelegramLinked` — so that field is skipped for it entirely rather than
 * shown disabled or asking for something that doesn't exist.
 */
function DeleteAccountSection({ profile }: { profile: MyProfile }) {
  const t = useT();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const deleteAccount = useDeleteAccount();

  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const isTelegram = user?.isTelegramLinked ?? false;
  const phraseOk = typed.length > 0 && typed === phrase;
  const canSubmit = phraseOk && (isTelegram || password.length > 0);

  const openDialog = () => {
    setPhrase(generateConfirmPhrase());
    setTyped("");
    setPassword("");
    setError(undefined);
    setOpen(true);
  };

  const onConfirm = () => {
    setError(undefined);
    deleteAccount.mutate(
      { password },
      {
        onSuccess: () => {
          toast.success(t("profile.settings.dangerZone.success"));
          logout();
          navigate("/", { replace: true });
        },
        onError: (err) => {
          setError(
            err instanceof ApiRequestError && err.status === 401
              ? t("profile.settings.dangerZone.wrongPassword")
              : t("errors.genericTitle"),
          );
        },
      },
    );
  };

  return (
    <SettingsSection
      title={t("profile.settings.dangerZone.title")}
      description={t("profile.settings.dangerZone.hint")}
      className="border-destructive/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-muted-foreground">
          {t("profile.settings.dangerZone.deleteAccountHint")}
        </p>
        <Button variant="destructive" onClick={openDialog} className="shrink-0">
          {t("profile.settings.dangerZone.deleteAccount")}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deleteAccount.isPending) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("profile.settings.dangerZone.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("profile.settings.dangerZone.dialogBody", { name: profile.displayName })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-account-phrase" className="text-xs font-medium text-muted-foreground">
                {t("profile.settings.dangerZone.typePhrase")}
              </label>
              <code className="select-all rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-center font-mono text-sm tracking-wide">
                {phrase}
              </code>
              <TextInput
                id="delete-account-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={typed.length > 0 && !phraseOk ? true : undefined}
              />
              {typed.length > 0 && !phraseOk && (
                <p className="text-xs text-destructive">
                  {t("profile.settings.dangerZone.phraseMismatch")}
                </p>
              )}
            </div>

            {isTelegram ? (
              <p className="text-xs text-muted-foreground">
                {t("profile.settings.dangerZone.passwordHintTelegram")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="delete-account-password" className="text-xs font-medium text-muted-foreground">
                  {t("profile.settings.dangerZone.password")}
                </label>
                <PasswordInput
                  id="delete-account-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("profile.settings.dangerZone.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!canSubmit || deleteAccount.isPending}
              onClick={onConfirm}
            >
              {deleteAccount.isPending && <Spinner data-icon="inline-start" />}
              {t("profile.settings.dangerZone.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

/**
 * A one-time birth date confirmation — the only thing that unlocks R+-rated
 * titles anywhere on the site. Hentai stays excluded no matter what's set
 * here; there is no version of this control that shows it. Locked once
 * saved (mirrors the username field above) — it's meant to be a real fact
 * about the account, not a toggle.
 */
function AgeVerificationSection({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const locked = Boolean(profile.birthDate);
  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <SettingsSection
      title={t("profile.settings.age.title")}
      description={t("profile.settings.age.hint")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={birthDate}
          max={maxDate}
          disabled={locked}
          onChange={(e) => setBirthDate(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        {locked ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" />
            {profile.isAdult
              ? t("profile.settings.age.verifiedAdult")
              : t("profile.settings.age.verifiedMinor")}
          </span>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            disabled={update.isPending || !birthDate}
            onClick={() =>
              update.mutate(
                { birthDate },
                {
                  onSuccess: () => toast.success(t("profile.settings.age.saved")),
                  onError: (e) =>
                    toast.error(
                      e instanceof Error ? e.message : t("errors.genericTitle"),
                    ),
                },
              )
            }
          >
            {t("profile.settings.save")}
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.neverHentai")}
      </p>
    </SettingsSection>
  );
}

/** Pick up to MAX_SHOWCASE_ACHIEVEMENTS earned achievements to pin under your name. */
function ShowcaseChips({
  profile,
  update,
  earned,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
  earned: EarnedAchievement[];
}) {
  const t = useT();
  const selected = profile.showcaseAchievementIds;

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    update.mutate({ showcaseAchievementIds: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs tabular-nums text-muted-foreground">
        {t("profile.settings.showcaseCount", {
          count: selected.length,
          max: MAX_SHOWCASE_ACHIEVEMENTS,
        })}
      </span>
      <div className="flex flex-wrap gap-2.5">
        {earned.map((a) => {
          const isSelected = selected.includes(a.id);
          const atLimit = !isSelected && selected.length >= MAX_SHOWCASE_ACHIEVEMENTS;
          return (
            <div key={a.id} className="relative">
              <HoloAchievementBadge
                id={a.id}
                rarity={a.rarity}
                earned
                earnedAt={a.earnedAt}
                variant="circle"
                onClick={atLimit ? undefined : () => toggle(a.id)}
                className={cn(atLimit && "opacity-40", !atLimit && "ring-2 ring-offset-2 ring-offset-card", isSelected ? "ring-primary" : "ring-transparent")}
              />
              {isSelected && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** PRO-only: a custom tag + icon shown next to your name in your profile and comments. */
function TitleEditor({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const [prefix, setPrefix] = useState(profile.titlePrefix ?? "");
  const [icon, setIcon] = useState<TitleIcon>(profile.titleIcon ?? "star");

  const save = () => {
    const value = prefix.trim();
    update.mutate(
      { titlePrefix: value || null, titleIcon: value ? icon : null },
      {
        onSuccess: () =>
          toast.success(
            value ? t("profile.settings.titleSaved") : t("profile.settings.titleCleared"),
          ),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
      },
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <SettingsLabel>{t("profile.settings.titlePro")}</SettingsLabel>
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("profile.settings.titleProHint")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TITLE_ICONS.map((key) => {
          const Icon = TITLE_ICON_COMPONENT[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setIcon(key)}
              aria-label={key}
              className={cn(
                "flex size-8 items-center justify-center rounded-md border transition-colors",
                icon === key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.slice(0, 20))}
          maxLength={20}
          placeholder={t("profile.settings.titlePlaceholder")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button size="sm" className="shrink-0" disabled={update.isPending} onClick={save}>
          {t("profile.settings.save")}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("common.preview")}</span>
        <UserTitleBadge prefix={prefix.trim() || null} icon={icon} />
      </div>
    </div>
  );
}

/**
 * Favourite-genre picker — feeds the home rail and every title's "similar
 * to". Deliberately set-once-plus-one-edit (see RecommendationService):
 * clicking a chip only ever changes a local draft, never saves by itself —
 * one "save" click commits the whole draft as a single edit, so picking
 * five genres costs one edit, not five. Liked titles on /recommendations
 * have no such limit; only this explicit genre list does.
 */
function GenrePreferencesSection() {
  const t = useT();
  const labels = useLabels();
  const { data: allGenres } = useGenres();
  const { data: status } = useGenrePreferencesStatus();
  const setPrefs = useSetGenrePreferences();
  const [draft, setDraft] = useState<number[] | null>(null);

  const saved = status?.genreIds ?? [];
  const active = draft ?? saved;
  const remainingEdits = status?.remainingEdits ?? 1; // optimistic default pre-load
  const locked = remainingEdits <= 0;
  const dirty = draft != null && !arraysMatchAsSets(draft, saved);

  const toggle = (id: number) => {
    if (locked) return;
    const base = draft ?? saved;
    setDraft(
      base.includes(id) ? base.filter((g) => g !== id) : [...base, id],
    );
  };

  const save = () => {
    if (!draft) return;
    setPrefs.mutate(draft, { onSuccess: () => setDraft(null) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(allGenres ?? []).map((g) => {
          const on = active.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              disabled={locked}
              onClick={() => toggle(g.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                locked && "cursor-not-allowed opacity-50",
                on
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {labels.genreLabel(g.name)}
            </button>
          );
        })}
      </div>

      {locked ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("profile.settings.genresLocked")}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={!dirty || setPrefs.isPending}
            onClick={save}
          >
            {t("profile.settings.save")}
          </Button>
          <span className="text-[11px] text-muted-foreground/80">
            {t("profile.settings.genresRemaining", { count: remainingEdits })}
          </span>
        </div>
      )}
    </div>
  );
}

function arraysMatchAsSets(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((v) => set.has(v));
}

/** Center-crop a picked image to a 512px square PNG data URL — no crop lib. */
function cropToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(
          img,
          (img.width - size) / 2,
          (img.height - size) / 2,
          size,
          size,
          0,
          0,
          512,
          512,
        );
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- achievements ---------------- */

function AchievementsTab() {
  const { data } = useAchievements();
  return <AchievementsGrid achievements={data ?? []} />;
}

type AchFilter = "all" | "earned" | "progress";

function AchievementsGrid({ achievements }: { achievements: EarnedAchievement[] }) {
  const t = useT();
  const [filter, setFilter] = useState<AchFilter>("all");
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);

  const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sorted = [...achievements].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return order[a.rarity] - order[b.rarity];
  });
  const earned = achievements.filter((a) => a.earned).length;
  const total = achievements.length || 1;
  const pct = Math.round((earned / total) * 100);

  const shown = sorted.filter((a) =>
    filter === "all"
      ? true
      : filter === "earned"
        ? a.earned
        : !a.earned && a.progress != null,
  );

  return (
    <section className="flex flex-col gap-4">
      {/* collection header: count, completion, filters — one block, not three */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-lg">{t("achievements.heading")}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {t("achievements.earnedOfTotal", { earned, total: achievements.length })}
            {" · "}
            {pct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "earned", "progress"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === f
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {t(
                f === "all"
                  ? "achievements.filterAll"
                  : f === "earned"
                    ? "achievements.filterEarned"
                    : "achievements.filterInProgress",
              )}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-card/20 px-6 py-10 text-center text-sm text-muted-foreground">
          {t("achievements.noneInFilter")}
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
          {shown.map((a) => (
            <HoloAchievementBadge
              key={a.id}
              id={a.id}
              rarity={a.rarity}
              earned={a.earned}
              earnedAt={a.earnedAt}
              progress={a.progress}
              onClick={() => setOpened(a)}
              className="w-[calc(50%-0.375rem)] sm:w-[220px]"
            />
          ))}
        </div>
      )}

      <AchievementDetailDialog
        achievement={opened}
        onOpenChange={(open) => !open && setOpened(null)}
      />
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <ProfileShell>
      <div className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl" />
    </ProfileShell>
  );
}
