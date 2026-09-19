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
import { type CSSProperties, useState } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CrownIcon,
  FilmIcon,
  LinkIcon,
  type LucideIcon,
  MailIcon,
  MonitorSmartphoneIcon,
  MoonStarIcon,
  StarIcon,
  SunIcon,
  PaletteIcon,
  PencilIcon,
  PlayCircleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SearchIcon,
  SparklesIcon,
  TimerIcon,
  Trash2Icon,
  TrophyIcon,
  UserIcon,
  XIcon,
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
  useSetUsername,
  useUpdateProfile,
  useVerifyEmail,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProfileMediaEditor } from "@/components/profile/profile-media-editor";

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
    <header className="reveal-group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <ProfileBanner
        url={profile.bannerUrl}
        accent={profile.accentColor}
        editable={editable}
        className="h-36 sm:h-48"
      />
      {/* The identity card rides up over the background's lower edge; the
          stats start below it. */}
      <div className="relative -mt-16 flex flex-col gap-5 px-5 pb-5 sm:-mt-20 sm:px-6 sm:pb-6 lg:flex-row lg:items-stretch">
      <div
        className="reveal flex shrink-0 flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/85 p-4 text-center shadow-xl shadow-black/10 backdrop-blur-md transition-all duration-300 hover:border-primary/25 hover:shadow-primary/10 lg:w-48"
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

      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:pt-24">
        <StatsGrid stats={stats} />
        {/* Real charts off the viewer's own list, not a genre tag cloud —
            the numbers above say "how much", these say "of what". Only on
            your own profile: the library endpoint is /library, i.e. yours,
            so there's nothing to plot on someone else's page. */}
        {editable && <LibraryCharts stats={stats} />}
      </div>
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
function SettingsRow({
  icon: Icon,
  label,
  value,
  info,
  control,
  expanded,
  onToggle,
  children,
}: {
  icon: LucideIcon;
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
        "group/row flex min-h-14 items-center gap-3 px-4 py-2.5",
        onToggle && "cursor-pointer transition-colors hover:bg-secondary/40 active:bg-secondary/60",
      )}
      onClick={onToggle}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? (e) => e.key === "Enter" && onToggle() : undefined}
    >
      {/* One treatment for every row, not a hue per row. Eight different
          colours down a single list made the list itself the loudest thing
          on the page, and implied a grouping that does not exist — these
          rows are siblings, not categories. The chip stays neutral and only
          takes the site colour once its row is open or hovered, so colour
          means state here rather than decoration. */}
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground transition-colors duration-200",
          onToggle && "group-hover/row:border-primary/30 group-hover/row:text-foreground",
          expanded && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
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
  const update = useUpdateProfile();
  const setUsername = useSetUsername();
  const { data: achievements } = useAchievements();

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

  return (
    <div className="flex flex-col gap-5">
      <SettingsList>
        <SettingsRow
          icon={UserIcon}
          label={t("profile.title")}
          value={profile.username ? t("profile.handle", { username: profile.username }) : bio || undefined}
          expanded={openRow === "identity"}
          onToggle={() => toggle("identity")}
        >
          <ProfileMediaEditor profile={profile} />
          <div className="mt-10 flex items-start gap-4">

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
        {/* Three choices hidden inside a 32px dropdown, where you could not
            see the options without opening it and could not tell which was
            active without reading. They are all on screen now, wide enough
            to hit, each showing what it actually means. */}
        <SettingsRow
          icon={PaletteIcon}
          label={t("profile.settings.theme")}
          value={t(
            theme === "light"
              ? "profile.settings.themeLight"
              : theme === "dark"
                ? "profile.settings.themeDark"
                : "profile.settings.themeAuto",
          )}
          expanded={openRow === "theme"}
          onToggle={() => toggle("theme")}
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "light", Icon: SunIcon, label: t("profile.settings.themeLight") },
                { key: "dark", Icon: MoonStarIcon, label: t("profile.settings.themeDark") },
                {
                  key: "system",
                  Icon: MonitorSmartphoneIcon,
                  label: t("profile.settings.themeAuto"),
                },
              ] as const
            ).map(({ key, Icon, label }) => {
              const active = (theme ?? "system") === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTheme(key);
                    // Saved to the account, not just this browser — so it
                    // follows the user to a new device (see ThemeSync).
                    update.mutate({ theme: key });
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200",
                    active
                      ? "border-transparent bg-gradient-to-br from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="relative z-10 size-5" />
                  <span className="relative z-10 truncate">{label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
                      active ? "via-white/30" : "via-primary/25",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow
          icon={MoonStarIcon}
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
              {/* Narrower on a phone: at 320px the fixed 8rem trigger plus
                  the icon chip and the label left the label nothing to
                  truncate into. */}
              <SelectTrigger className="h-8 w-28 text-xs sm:w-32">
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
/** Mirrors `setGenrePreferencesInputSchema`'s own `.max(30)` in shared. The
 *  server stays the authority; this only stops us sending a request that is
 *  guaranteed to come back 400 — which is what used to happen, silently. */
const MAX_FAVOURITE_GENRES = 30;

/** How much of the full list is shown before "show all". Rendering every
 *  genre at once was the densest thing on the page by a wide margin. */
const GENRE_PREVIEW_COUNT = 18;

/**
 * The favourite-genre picker.
 *
 * Previously: every genre the site knows, rendered as one flat wrap of
 * identical pills, with no search, no count, and a save whose failure was
 * invisible. Two things were actually broken by that. The list was a wall
 * you had to read linearly to find anything in, and picking more than the
 * thirty the API accepts produced a rejected request that nothing on screen
 * acknowledged — the button simply returned to idle, so the feature read as
 * dead.
 *
 * Now the picks are lifted out above the list (so the list below is only
 * ever "what you could add"), the rest is searchable and folded to a
 * preview, the cap is enforced and stated, and a failed save says so.
 */
function GenrePreferencesSection() {
  const t = useT();
  const labels = useLabels();
  const { data: allGenres } = useGenres();
  const { data: status } = useGenrePreferencesStatus();
  const setPrefs = useSetGenrePreferences();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const saved = status?.genreIds ?? [];
  const active = draft ?? saved;
  const remainingEdits = status?.remainingEdits ?? 1; // optimistic default pre-load
  const locked = remainingEdits <= 0;
  const dirty = draft != null && !arraysMatchAsSets(draft, saved);

  const genres = allGenres ?? [];
  const term = query.trim().toLowerCase();
  const picked = genres.filter((g) => active.includes(g.id));
  const pickable = genres
    .filter((g) => !active.includes(g.id))
    .filter((g) => !term || labels.genreLabel(g.name).toLowerCase().includes(term));
  // A search is already a narrowing, so it overrides the fold — hiding
  // matches behind "show all" would defeat the point of having typed.
  const visible = showAll || term ? pickable : pickable.slice(0, GENRE_PREVIEW_COUNT);
  const atCap = active.length >= MAX_FAVOURITE_GENRES;

  const toggle = (id: number) => {
    if (locked) return;
    const base = draft ?? saved;
    if (!base.includes(id) && base.length >= MAX_FAVOURITE_GENRES) {
      toast.error(t("profile.settings.genresMax", { max: MAX_FAVOURITE_GENRES }));
      return;
    }
    setDraft(base.includes(id) ? base.filter((g) => g !== id) : [...base, id]);
  };

  const save = () => {
    if (!draft) return;
    setPrefs.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("common.save"));
      },
      // Without this branch a rejected save did nothing observable at all.
      onError: (err) =>
        toast.error(
          err instanceof ApiRequestError
            ? err.message
            : t("profile.settings.genresSaveError"),
        ),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* What you've picked, first and on its own — the answer to "what did
          I choose?" should never require scanning the whole catalogue for
          highlighted pills. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {t("profile.settings.genresPicked", {
              count: active.length,
              max: MAX_FAVOURITE_GENRES,
            })}
          </span>
          {!locked && picked.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft([])}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("profile.settings.genresClear")}
            </button>
          )}
        </div>
        {picked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-[11px] text-muted-foreground">
            {t("profile.settings.genresNonePicked")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={locked}
                onClick={() => toggle(g.id)}
                aria-label={t("profile.settings.genresRemove", {
                  genre: labels.genreLabel(g.name),
                })}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary px-2.5 py-1 text-xs text-primary-foreground shadow-sm shadow-primary/25 transition-all duration-200",
                  locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5",
                )}
              >
                {labels.genreLabel(g.name)}
                {!locked && <XIcon className="size-3 opacity-70 group-hover:opacity-100" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {!locked && (
        <>
          {/* Search instead of scanning. Same pill and focus bloom as every
              other field on the site. */}
          <div className="group relative flex items-center rounded-full border border-border/60 bg-background/60 transition-all duration-200 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
            <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("profile.settings.genresSearch")}
              className="h-9 w-full rounded-full bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          {visible.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              {t("search.noMatches")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={false}
                  disabled={atCap}
                  onClick={() => toggle(g.id)}
                  className={cn(
                    "rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-all duration-200",
                    atCap
                      ? "cursor-not-allowed opacity-40"
                      : "hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {labels.genreLabel(g.name)}
                </button>
              ))}
            </div>
          )}

          {!term && pickable.length > GENRE_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              {showAll
                ? t("common.showLess")
                : t("profile.settings.genresShowAll", {
                    count: pickable.length - GENRE_PREVIEW_COUNT,
                  })}
            </button>
          )}
        </>
      )}

      {locked ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("profile.settings.genresLocked")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="sm" disabled={!dirty || setPrefs.isPending} onClick={save}>
            {setPrefs.isPending && <Spinner data-icon="inline-start" />}
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
