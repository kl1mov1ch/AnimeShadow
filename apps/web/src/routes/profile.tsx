import type {
  EarnedAchievement,
  LibraryStatus,
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
  ChevronRightIcon,
  ClockIcon,
  CrownIcon,
  FilmIcon,
  LinkIcon,
  Loader2Icon,
  type LucideIcon,
  MailIcon,
  MoonStarIcon,
  StarIcon,
  PaletteIcon,
  PencilIcon,
  PlayCircleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SearchIcon,
  ShuffleIcon,
  SparklesIcon,
  TimerIcon,
  Trash2Icon,
  TrophyIcon,
  UserIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { AchievementBadge } from "@/components/achievement-badge";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Area, AreaChart, Pie, PieChart, XAxis, YAxis } from "recharts";
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
  useLibrary,
  useMyProfile,
  useMyProgress,
  usePublicProfile,
  useReactionGif,
  useResendVerification,
  useSetGenrePreferences,
  useSetRandomAvatar,
  useSetUsername,
  useUpdateProfile,
  useUploadAvatar,
  useVerifyEmail,
} from "@/lib/query";
import { cn } from "@/lib/utils";

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
      <ProfileHero profile={data} stats={data.stats} />
      {data.stats.topRated.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("profile.summary.topRated")}
          </span>
          <TopRatedList titles={data.stats.topRated} className="max-w-xs" />
        </section>
      )}
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
      <ProfileHero profile={profile} stats={profile.stats} editable />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setSearchParams(v === "progress" ? {} : { tab: v }, { replace: true })
        }
        className="gap-5 lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-6"
      >
        {/* The page's primary navigation — a sidebar from desktop up (the
            same shape as a Telegram settings screen: one rail, three
            destinations, always in view instead of scrolled past), a
            compact pill row on a phone where there's no side to spare. Each
            tab gets its own colour instead of the one shared shade every
            active state used to switch to and from — the flat monochrome
            row was itself part of what read as "grey" and made switching
            tabs feel like nothing had actually changed. */}
        <TabsList className="h-auto! w-full flex-row justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-1.5 [scrollbar-width:none] lg:sticky lg:top-20 lg:flex-col lg:items-stretch lg:gap-1.5 lg:overflow-visible lg:p-2 [&::-webkit-scrollbar]:hidden">
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

        {/* Switching tabs used to swap content instantly, which read as a
            jump rather than a move. Each panel now fades and rises the
            moment it mounts — Radix unmounts the inactive ones, so the
            animation replays on every switch without any state of its own. */}
        <div className="min-w-0">
          <TabsContent
            value="progress"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <ProgressTab profile={profile} />
          </TabsContent>
          <TabsContent
            value="settings"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <SettingsTab profile={profile} />
          </TabsContent>
          <TabsContent
            value="achievements"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <AchievementsTab />
          </TabsContent>
        </div>
      </Tabs>
    </ProfileShell>
  );
}

/**
 * Three tabs used to mean three unrelated accent colours — sky, violet,
 * amber — which made the rail read as a paint chart rather than as one
 * control. They now share the site's own pill language: a gradient fill
 * for wherever you are, a quiet lift for everywhere else, and the same
 * band of light every other button here sweeps on hover.
 */
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
      className={cn(
        "group relative h-auto flex-none justify-start gap-2 overflow-hidden rounded-full border-transparent px-3.5 py-2 text-foreground/70 transition-all duration-200 sm:px-4 lg:w-full",
        "hover:-translate-y-0.5 hover:bg-secondary/60 hover:text-foreground",
        "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:via-primary/85 data-[state=active]:to-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 data-[state=active]:hover:translate-y-0",
      )}
    >
      <Icon className="relative z-10 size-4 shrink-0" />
      <span className="relative z-10">{label}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-primary/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%] group-data-[state=active]:via-white/30"
      />
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

/** A tinted chip per rank instead of a plain grey box with a coloured dot —
 * the rank badge is the one thing in the hero that's actually earned, so it
 * gets to look like it. */
const RANK_CHIP: Record<Rank, string> = {
  NOVICE: "border-border/60 bg-secondary/40",
  ADVANCED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  EXPERT: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  LEGEND: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

/**
 * Avatar anchors the block, the name is the loudest thing on the page, and
 * rank/PRO live in their own labelled rail on the right instead of trailing
 * the name as a row of look-alike badges.
 */
/**
 * Identity and stats used to be two separate blocks (a hero card, then a
 * stat-cards row below it) — one surface now: a small square of "who this
 * is" on the left (avatar, name, pinned achievements with their actual
 * names underneath instead of bare unlabelled circles), and the numbers
 * plus the list charts filling the rest of the row, so it reads as one
 * finished card instead of a tall square next to a short one with empty
 * space trailing it.
 */
function ProfileHero({
  profile,
  stats,
  editable = false,
}: {
  profile: PublicProfile;
  stats: ProfileStats;
  /** Only the account's own page gets the hover-to-edit affordance — a
   * visitor on someone else's profile has nothing to edit here. */
  editable?: boolean;
}) {
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

  const avatar = (
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
  );

  return (
    <>
    <header className="reveal-group flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/40 p-5 sm:p-6 lg:flex-row lg:items-stretch">
      <div
        className="reveal flex shrink-0 flex-col items-center gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-4 text-center transition-all duration-300 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 lg:w-48"
        style={{ "--i": 0 } as CSSProperties}
      >
        {editable ? (
          <Link
            to="/profile?tab=settings"
            className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("profile.settings.avatarUpload")}
          >
            {avatar}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100">
              <PencilIcon className="size-5 text-white" />
            </span>
          </Link>
        ) : (
          avatar
        )}

        <div className="flex min-w-0 flex-col items-center gap-1">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <h1 className="font-display text-xl leading-tight [overflow-wrap:anywhere]">
              {profile.displayName}
            </h1>
            <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} />
          </div>
          {profile.username && (
            <p className="truncate text-xs text-muted-foreground">
              {t("profile.handle", { username: profile.username })}
            </p>
          )}
        </div>

        {profile.bio && (
          <p className="line-clamp-2 text-xs leading-relaxed text-foreground/85">{profile.bio}</p>
        )}

        {pinned.length > 0 && (
          // One row of bare circles, not a caption grid — the name only
          // costs a hover now (a tooltip), which is what let the whole
          // identity column below get narrower.
          <div className="flex flex-nowrap items-center justify-center gap-2">
            {pinned.map((a) => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => setOpened(a)} className="outline-none">
                    <HoloAchievementBadge
                      id={a.id}
                      rarity={a.rarity}
                      earned
                      earnedAt={a.earnedAt}
                      variant="circle"
                      className="size-8"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {profile.achievements.some((a) => a.earned) && (
          <Link
            to="/profile?tab=achievements"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
          >
            <TrophyIcon className="size-3" />
            {t("achievements.viewAll")}
          </Link>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-1">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2 py-1",
              RANK_CHIP[profile.rank],
            )}
          >
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", RANK_DOT[profile.rank])} />
            <span className="text-[11px] font-medium">
              {t(`profile.rank.${profile.rank.toLowerCase()}`)}
            </span>
            <InfoTooltip side="bottom" className="size-3.5 opacity-70 hover:opacity-100">
              {t("profile.rank.hint")}
            </InfoTooltip>
          </div>
          {profile.isPro && (
            <span className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold tracking-wide text-primary">
              <SparklesIcon className="size-3" />
              PRO
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          {t("profile.memberSince", { date: memberSince })}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <StatsGrid stats={stats} />
        {/* Real charts off the viewer's own list, not a genre tag cloud —
            the numbers above say "how much", these say "of what". Only on
            your own profile: the library endpoint is /library, i.e. yours,
            so there's nothing to plot on someone else's page. */}
        {editable && <LibraryCharts stats={stats} />}
      </div>
    </header>
    <AchievementDetailDialog
      achievement={opened}
      onOpenChange={(open) => !open && setOpened(null)}
    />
    </>
  );
}

/** Top 3 titles by the viewer's own score, as a compact list — a rank
 * number, a small thumb, the title, the score, nothing else on the row
 * itself. A tooltip carries the full title and score so the row can stay
 * this narrow instead of a poster-sized card per title. Real ratings
 * only, never a placeholder for a title that just happens to sit on the
 * list unscored. */
function TopRatedList({
  titles,
  className,
}: {
  titles: ProfileStats["topRated"];
  className?: string;
}) {
  if (titles.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {titles.map((title, i) => (
        <Tooltip key={title.animeId}>
          <TooltipTrigger asChild>
            <Link
              to={`/anime/${title.slug}`}
              className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-3 shrink-0 text-center text-[10px] font-semibold text-muted-foreground/60">
                {i + 1}
              </span>
              <span className="relative size-7 shrink-0 overflow-hidden rounded-md bg-muted">
                {title.imageUrl ? (
                  <img
                    src={imageSrc(title.imageUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  <PosterFallback title={title.title} seed={title.animeId} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{title.title}</span>
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-amber-500">
                <StarIcon className="size-2.5 fill-current" />
                {title.score}
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            {title.title} · {title.score}/10
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

const LIBRARY_STATUSES: LibraryStatus[] = [
  "WATCHING",
  "COMPLETED",
  "PLANNED",
  "ON_HOLD",
  "DROPPED",
];

/** One hue — the site's own — stepped down in strength per slice, instead
 * of five unrelated colours. A status ring is one measurement, so it reads
 * as one colour family; the legend/tooltip is what names the slices. */
function primaryShade(index: number): string {
  const strength = Math.max(25, 92 - index * 16);
  return `color-mix(in oklab, var(--primary) ${strength}%, transparent)`;
}

/** Card shell for a chart, with the site's own 影 mark watermarked behind
 * it — the same glyph as the header and the toasts, at a weight that never
 * competes with the data. */
function ChartPanel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "reveal relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-card/40 p-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -top-4 select-none font-display text-7xl leading-none text-primary/[0.07]"
      >
        影
      </span>
      <span className="relative text-xs font-medium text-muted-foreground">{title}</span>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * What the viewer actually did, not just what's on their shelf: minutes
 * watched per day over the last two weeks, and how the list splits by
 * status. One hue throughout (the site's own) — these are two views of one
 * person's watching, not five unrelated series that need telling apart.
 */
function LibraryCharts({ stats }: { stats: ProfileStats }) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { data: entries = [], isPending } = useLibrary();

  const activity = stats.dailyActivity;
  const hasActivity = activity.some((d) => d.minutes > 0 || d.episodes > 0);

  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });

  if (isPending) return <Skeleton className="h-44 flex-1 rounded-xl" />;

  if (entries.length === 0 && !hasActivity) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/20 p-4 text-center text-xs text-muted-foreground">
        {t("profile.summary.chartsEmpty")}
      </div>
    );
  }

  const byStatus = LIBRARY_STATUSES.map((status, i) => ({
    status,
    count: entries.filter((e) => e.status === status).length,
    fill: primaryShade(i),
  })).filter((row) => row.count > 0);

  const statusConfig: ChartConfig = Object.fromEntries(
    LIBRARY_STATUSES.map((status, i) => [
      status,
      { label: labels.statusLabel(status), color: primaryShade(i) },
    ]),
  );

  const activityConfig = {
    minutes: { label: t("profile.summary.minutesAxis"), color: "var(--primary)" },
    episodes: { label: t("profile.summary.episodesAxis"), color: "var(--primary)" },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
      <ChartPanel title={t("profile.summary.activityChart")} className="flex-[2]">
        <ChartContainer config={activityConfig} className="aspect-auto h-[140px] w-full">
          <AreaChart data={activity} margin={{ top: 4, right: 6, bottom: 0, left: -30 }}>
            <defs>
              <linearGradient id="profile-activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={22}
              tick={{ fontSize: 9 }}
              tickFormatter={dayLabel}
            />
            <YAxis hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent labelFormatter={(value) => dayLabel(String(value))} />}
            />
            <Area
              dataKey="minutes"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#profile-activity-fill)"
              animationDuration={900}
            />
            <Area
              dataKey="episodes"
              type="monotone"
              stroke="var(--primary)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="none"
              animationDuration={900}
            />
          </AreaChart>
        </ChartContainer>
      </ChartPanel>

      {(byStatus.length > 0 || stats.topRated.length > 0) && (
        <ChartPanel title={t("profile.summary.libraryChart")} className="flex-1">
          {byStatus.length > 0 && (
            // Smaller than before — the freed height is exactly what the
            // top-3 list below borrows, so the panel doesn't grow taller
            // than the activity chart next to it.
            <ChartContainer config={statusConfig} className="mx-auto aspect-square w-full max-w-[92px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="status" />} />
                <Pie
                  data={byStatus}
                  dataKey="count"
                  nameKey="status"
                  innerRadius="60%"
                  outerRadius="92%"
                  paddingAngle={3}
                  cornerRadius={6}
                  strokeWidth={0}
                  animationDuration={900}
                />
              </PieChart>
            </ChartContainer>
          )}
          {stats.topRated.length > 0 && (
            <TopRatedList
              titles={stats.topRated}
              className={byStatus.length > 0 ? "mt-2 border-t border-border/60 pt-2" : undefined}
            />
          )}
        </ChartPanel>
      )}
    </div>
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

  const cards: Array<{
    icon: typeof ClockIcon;
    label: string;
    value: string;
  }> = [
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
    // One colour family (the site's own primary, just a touch of gradient
    // between the four cards) instead of a different hue per card — four
    // unrelated colours in a row read as noisy, not lively.
    <div className="reveal-group grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, value }, i) => (
        <div
          key={label}
          className="reveal group relative flex h-full flex-col justify-between gap-2.5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] to-transparent p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
          style={{ "--i": i } as CSSProperties}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-primary/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
          />
          <span className="relative z-10 flex w-fit items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary/90">
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <span className="relative z-10 min-w-0 truncate font-display text-lg leading-tight tabular-nums sm:text-xl">
            {value}
          </span>
        </div>
      ))}
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

const PROGRESS_PAGE_SIZE = 9;
const FREE_PROGRESS_LIMIT = 10;

/**
 * The four-line side rail this used to be is now one row across the top —
 * a running commentary on the list below rather than a box next to it that
 * repeated numbers already on screen. Search, a status filter and paging
 * are new: the list itself used to just be every tracked title, in order,
 * with no way to jump to one by name once there were more than a screenful.
 */
function ProgressTab({ profile }: { profile: MyProfile }) {
  const t = useT();
  const labels = useLabels();
  const { data, isPending } = useMyProgress();
  const deleteProgress = useDeleteProgress();
  const rows = data ?? [];

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "watching" | "completed">("all");
  const [page, setPage] = useState(1);

  const inProgress = rows.filter((r) => !r.completed).length;
  const lastWatched = rows[0]?.lastWatchedAt ? labels.formatDate(rows[0]!.lastWatchedAt) : null;

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q && !r.title.toLowerCase().includes(q)) return false;
    if (statusFilter === "watching" && r.completed) return false;
    if (statusFilter === "completed" && !r.completed) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PROGRESS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PROGRESS_PAGE_SIZE,
    safePage * PROGRESS_PAGE_SIZE,
  );

  const resetPage = () => setPage(1);
  const atFreeLimit = !profile.isPro && rows.length >= FREE_PROGRESS_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      {/* One line, not a sidebar box — "Прогресс" restated four different
          ways used to live next to the list in its own card; here it's a
          running header for the exact same list, no numbers duplicated. */}
      {!isPending && (
        <div className="reveal-group flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
          <ProgressStat label={t("profile.summary.inProgress")} value={String(inProgress)} i={0} />
          <ProgressStat
            label={t("profile.summary.completedTitles")}
            value={String(profile.stats.titlesCompleted)}
            i={1}
          />
          {profile.stats.meanScore != null && (
            <ProgressStat
              label={t("profile.summary.meanScore")}
              value={t("library.scoreValue", { value: profile.stats.meanScore })}
              i={2}
            />
          )}
          {lastWatched && (
            <ProgressStat label={t("profile.summary.lastWatched")} value={lastWatched} i={3} />
          )}
        </div>
      )}

      {atFreeLimit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-xs text-foreground/85">
          <SparklesIcon className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            {t("profile.progress.freeLimit", { count: FREE_PROGRESS_LIMIT })}
          </span>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/support">{t("footer.pro")}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeading
          title={t("home.continueRail")}
          hint={isPending ? undefined : t("library.countTracked", { count: filtered.length })}
        />
        {rows.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* The same focus-blooming pill as the header and catalogue
                search fields, so every search box on the site behaves
                identically. */}
            <div className="group relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60 transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-primary" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder={t("profile.progress.searchPlaceholder")}
                className="h-8 w-40 rounded-full border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-all duration-200 focus:border-primary/50 focus:bg-card focus:ring-4 focus:ring-primary/15 sm:w-48"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter);
                resetPage();
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("profile.progress.filterAll")}</SelectItem>
                <SelectItem value="watching">{t("profile.progress.filterWatching")}</SelectItem>
                <SelectItem value="completed">{t("profile.progress.filterCompleted")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <ProgressEmpty />
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("detail.noCharactersMatch")}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((row) => (
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
          {/* Matches the catalogue's pager: rounded, lifting, with the
              current position carried in the site colour rather than as
              flat grey text. */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("common.previous")}
              </Button>
              <span className="flex items-baseline gap-1 text-xs tabular-nums">
                <span className="font-semibold text-primary">{safePage}</span>
                <span className="text-muted-foreground/60">/</span>
                <span className="text-muted-foreground">{pageCount}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressStat({ label, value, i }: { label: string; value: string; i: number }) {
  return (
    <span
      className="reveal flex items-baseline gap-1.5 text-xs"
      style={{ "--i": i } as CSSProperties}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}


/* ---------------- settings tab ---------------- */

/** A small sub-field label, for the rare expanded row with more than one
 * input inside it (identity's username + bio, the PRO title's icon +
 * text) — most rows need no label of their own since the row header
 * already names the setting. */
function SettingsLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

/** One rounded list, hairline dividers between rows — the Telegram settings-
 * screen shape: a single continuous surface instead of a stack of separate
 * bordered cards each with their own heading and padding. */
function SettingsList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {children}
    </div>
  );
}

/**
 * One row. Two shapes, matching how Telegram itself splits its own settings:
 * - `control` — a value that's already a single-tap picker (a two/three-way
 *   Select) sits inline as the row's trailing content, no extra tap needed.
 * - `children` — anything bigger (text fields, a picker grid, a form) stays
 *   collapsed behind the row and only takes up space once it's opened; the
 *   summary value (if any) is what's visible either way.
 */
/** Each row gets its own colour chip behind the icon — a whole list of
 * identical grey icons is itself a big part of what read as flat and grey;
 * a different, deliberate hue per row (à la Telegram's own settings icons)
 * makes each one legible as a distinct destination at a glance instead of
 * a row of interchangeable bullets. */
const ROW_HUE = {
  primary: "bg-primary/15 text-primary",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
} satisfies Record<string, string>;

function SettingsRow({
  icon: Icon,
  hue = "primary",
  label,
  value,
  info,
  control,
  expanded,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  hue?: keyof typeof ROW_HUE;
  label: string;
  value?: React.ReactNode;
  info?: React.ReactNode;
  control?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const header = (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 px-4 py-2.5",
        onToggle && "cursor-pointer transition-colors hover:bg-secondary/40 active:bg-secondary/60",
      )}
      onClick={onToggle}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? (e) => e.key === "Enter" && onToggle() : undefined}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ROW_HUE[hue])}>
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium">
        {label}
        {info}
      </span>
      {control ?? (
        <>
          {value && (
            <span className="min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">
              {value}
            </span>
          )}
          {onToggle && (
            <ChevronRightIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground/50 transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      {header}
      {/* Opens with a fade and a small rise rather than appearing outright.
          Still conditionally mounted: keeping a collapsed form in the DOM
          just to animate its height would leave its inputs reachable by
          keyboard while invisible, which is a worse bug than an instant
          close. */}
      {expanded && children && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 px-4 pb-4 pt-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
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
  const [uname, setUname] = useState(profile.username ?? "");
  // One row open at a time, accordion-style — the Telegram settings screen
  // this is modeled on never shows two expanded sub-forms at once either.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (key: string) => setOpenRow((cur) => (cur === key ? null : key));

  const { data: genreStatus } = useGenrePreferencesStatus();

  const earned = (achievements ?? []).filter((a) => a.earned);

  // One card, one save — claiming a username (only possible once) and
  // editing the bio used to each need their own button; a viewer editing
  // both had to click twice for two changes that live in the same place.
  const usernameClaimable = !profile.username && uname.trim().length >= 3;
  const bioDirty = bio !== (profile.bio ?? "");
  const identityDirty = usernameClaimable || bioDirty;
  const identitySaving = setUsername.isPending || update.isPending;

  const saveIdentity = () => {
    if (usernameClaimable) {
      setUsername.mutate(uname, {
        onSuccess: () => {
          toast.success(t("profile.settings.usernameSet"));
          if (bioDirty) update.mutate({ bio: bio || null });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
      });
    } else if (bioDirty) {
      update.mutate({ bio: bio || null }, { onSuccess: () => toast.success(t("common.save")) });
    }
  };

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

  return (
    <div className="flex flex-col gap-5">
      <SettingsList>
        <SettingsRow
          icon={UserIcon}
          hue="primary"
          label={t("profile.title")}
          value={profile.username ? t("profile.handle", { username: profile.username }) : bio || undefined}
          expanded={openRow === "identity"}
          onToggle={() => toggle("identity")}
        >
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
                {profile.username && (
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
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {profile.username
                  ? t("profile.settings.usernameHint")
                  : t("profile.settings.usernameClaimHint")}
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
            <span className="text-[11px] text-muted-foreground/80">
              {bio.length}/500 · {t("profile.settings.bioHint")}
            </span>
          </div>

          {/* One button for both fields above — a username claim and a bio
              edit used to each demand their own "Save", which meant two
              clicks for one visit here. Whichever changed (or both) goes out
              together. */}
          <div className="flex justify-end">
            <Button size="sm" disabled={!identityDirty || identitySaving} onClick={saveIdentity}>
              {t("profile.settings.save")}
            </Button>
          </div>
        </SettingsRow>

        {/* Theme and status both save the instant you pick them — a
            two/three-way choice doesn't need a confirmation step, so the
            picker sits right in the row instead of behind a tap. */}
        <SettingsRow
          icon={PaletteIcon}
          hue="violet"
          label={t("profile.settings.theme")}
          control={
            <Select
              value={theme ?? "system"}
              onValueChange={(value) => {
                setTheme(value);
                // Saved to the account, not just this browser — so it
                // follows the user to a new device (see ThemeSync).
                update.mutate({ theme: value as "light" | "dark" | "system" });
              }}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t("profile.settings.themeLight")}</SelectItem>
                <SelectItem value="dark">{t("profile.settings.themeDark")}</SelectItem>
                <SelectItem value="system">{t("profile.settings.themeAuto")}</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          icon={MoonStarIcon}
          hue="sky"
          label={t("profile.settings.status")}
          info={<InfoTooltip>{t("profile.settings.statusHint")}</InfoTooltip>}
          control={
            <Select
              value={statusValue}
              onValueChange={(v) => {
                setStatusValue(v as MyProfile["onlineStatus"]);
                update.mutate({ onlineStatus: v as MyProfile["onlineStatus"] });
              }}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONLINE">{t("profile.presence.online")}</SelectItem>
                <SelectItem value="OFFLINE">{t("profile.presence.offline")}</SelectItem>
                <SelectItem value="DND">{t("profile.presence.dnd")}</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          icon={ShieldCheckIcon}
          hue="amber"
          label={t("profile.settings.age.title")}
          value={
            profile.birthDate
              ? profile.isAdult
                ? t("profile.settings.age.verifiedAdult")
                : t("profile.settings.age.verifiedMinor")
              : t("profile.settings.age.notSet")
          }
          expanded={openRow === "age"}
          onToggle={profile.birthDate ? undefined : () => toggle("age")}
        >
          <AgeVerificationContent profile={profile} update={update} />
        </SettingsRow>
        {earned.length > 0 && (
          <SettingsRow
            icon={TrophyIcon}
            hue="fuchsia"
            label={t("profile.settings.showcase")}
            value={t("profile.settings.showcaseCount", {
              count: profile.showcaseAchievementIds.length,
              max: MAX_SHOWCASE_ACHIEVEMENTS,
            })}
            expanded={openRow === "showcase"}
            onToggle={() => toggle("showcase")}
          >
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              {t("profile.settings.showcaseHint")}
            </p>
            <ShowcaseChips profile={profile} update={update} earned={earned} />
          </SettingsRow>
        )}

        {profile.isPro && (
          <SettingsRow
            icon={CrownIcon}
            hue="amber"
            label={t("profile.settings.titlePro")}
            value={profile.titlePrefix ?? undefined}
            expanded={openRow === "title"}
            onToggle={() => toggle("title")}
          >
            <TitleEditor profile={profile} update={update} />
          </SettingsRow>
        )}

        <SettingsRow
          icon={SparklesIcon}
          hue="rose"
          label={t("profile.settings.genres")}
          value={
            genreStatus?.genreIds.length
              ? t("profile.settings.genresCount", { count: genreStatus.genreIds.length })
              : undefined
          }
          expanded={openRow === "genres"}
          onToggle={() => toggle("genres")}
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            {t("profile.settings.genresHint")}
          </p>
          <GenrePreferencesSection />
        </SettingsRow>

        <EmailVerificationRow
          expanded={openRow === "email"}
          onToggle={() => toggle("email")}
        />
      </SettingsList>

      <DeleteAccountSection profile={profile} />
    </div>
  );
}

/**
 * Only for accounts created before signup itself required a code — every
 * newer account is verified the moment it exists. Telegram accounts have no
 * inbox behind them, so they never see this.
 */
function EmailVerificationRow({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
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
    <SettingsRow
      icon={MailIcon}
      hue="primary"
      label={t("profile.settings.emailVerification.title")}
      value={t("profile.settings.emailVerification.unverified")}
      expanded={expanded}
      onToggle={onToggle}
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.emailVerification.hint", { email: user.email })}
      </p>
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
    </SettingsRow>
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

  const gif = useReactionGif("cry", open);

  return (
    <>
      {/* Deliberately not a card — a boxed "danger zone" with its own
          heading and border draws the eye exactly as much as every other
          setting on the page, which is backwards for the one thing here
          nobody should click by accident. Just a quiet link, easy to find
          if you're looking for it and easy to scroll past if you're not. */}
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground/70 transition-colors hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
        {t("profile.settings.dangerZone.deleteAccount")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deleteAccount.isPending) setOpen(next);
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          {/* The one dialog on the site that's allowed to be a little
              theatrical — everywhere else, a confirm dialog is neutral by
              design; here, the whole point is making the visitor pause. */}
          <div className="relative flex flex-col items-center gap-2 border-b border-border/60 bg-gradient-to-b from-destructive/10 to-transparent px-6 pb-4 pt-6 text-center">
            <div className="size-28 overflow-hidden rounded-2xl bg-muted">
              {gif.data?.url && (
                <img src={gif.data.url} alt="" className="size-full object-cover" />
              )}
            </div>
            <DialogHeader className="items-center gap-1">
              <DialogTitle className="text-lg">
                {t("profile.settings.dangerZone.dialogTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("profile.settings.dangerZone.dialogBody", { name: profile.displayName })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-4 px-6 pb-6">
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

          <DialogFooter className="px-6 pb-6">
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
    </>
  );
}

/**
 * A one-time birth date confirmation — the only thing that unlocks R+-rated
 * titles anywhere on the site. Hentai stays excluded no matter what's set
 * here; there is no version of this control that shows it. Locked once
 * saved (mirrors the username field above) — it's meant to be a real fact
 * about the account, not a toggle.
 */
/** Bare content for the age-verification row — only ever shown expanded
 * while unset (see the row's onToggle above: once verified, there's a
 * status to show but nothing left to do, so it collapses for good). */
function AgeVerificationContent({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.hint")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={birthDate}
          max={maxDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
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
                  toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
              },
            )
          }
        >
          {t("profile.settings.save")}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.neverHentai")}
      </p>
    </>
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

  const pinnedInOrder = selected
    .map((id) => earned.find((a) => a.id === id))
    .filter((a): a is EarnedAchievement => a != null);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs tabular-nums text-muted-foreground">
        {t("profile.settings.showcaseCount", {
          count: selected.length,
          max: MAX_SHOWCASE_ACHIEVEMENTS,
        })}
      </span>

      {/* Exactly the row a comment or the profile header actually renders —
          picking a badge below updates this immediately, so there's no
          guessing what "pinned" will look like next to your name until you
          go find a comment of yours to check. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-secondary/20 px-3 py-2 text-xs">
        <span className="shrink-0 text-muted-foreground/70">{t("common.preview")}:</span>
        <span className="font-medium">{profile.displayName}</span>
        <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} compact />
        {pinnedInOrder.length === 0 ? (
          <span className="text-muted-foreground/60">{t("profile.settings.showcaseEmpty")}</span>
        ) : (
          pinnedInOrder.map((a) => <AchievementBadge key={a.id} id={a.id} compact />)
        )}
      </div>

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
                // A picker can show every earned badge at once — the full
                // tilt/foil-loop treatment on all of them simultaneously is
                // the exact "system load" this is meant to avoid.
                animated={false}
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
  const savedPrefix = profile.titlePrefix ?? "";
  const savedIcon = profile.titleIcon ?? "star";

  // Autosaves — an icon pick or leaving the text field, no separate button.
  // It's two short strings; the cost of saving on every real change is
  // trivial next to the cost of one more button to click.
  const commit = (nextPrefix: string, nextIcon: TitleIcon) => {
    const value = nextPrefix.trim();
    if (value === savedPrefix && nextIcon === savedIcon) return;
    update.mutate(
      { titlePrefix: value || null, titleIcon: value ? nextIcon : null },
      { onError: (e) => toast.error(e instanceof Error ? e.message : t("errors.genericTitle")) },
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
              onClick={() => {
                setIcon(key);
                commit(prefix, key);
              }}
              aria-label={key}
              className={cn(
                "flex size-8 items-center justify-center rounded-full border transition-all duration-200",
                icon === key
                  ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "border-border/60 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>

      <input
        value={prefix}
        onChange={(e) => setPrefix(e.target.value.slice(0, 20))}
        onBlur={() => commit(prefix, icon)}
        maxLength={20}
        placeholder={t("profile.settings.titlePlaceholder")}
        className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

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
                "rounded-full border px-2.5 py-1 text-xs transition-all duration-200",
                locked && "cursor-not-allowed opacity-50",
                on
                  ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "border-border/60 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
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
            className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary shadow-[0_0_12px_-2px_var(--primary)] transition-[width] duration-700 ease-out"
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
                "group relative overflow-hidden rounded-full border px-3 py-1 text-xs transition-all duration-200",
                filter === f
                  ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "border-border/60 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
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
      {/* Shapes match what actually loads — rounded to the same radius as
          the real hero and stat cards, so the page does not visibly change
          geometry the moment data arrives. */}
      <div className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-full" />
    </ProfileShell>
  );
}
