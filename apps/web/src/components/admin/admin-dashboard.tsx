import type { AdminOverview } from "@animeshadow/shared";
import {
  ActivityIcon,
  ClockIcon,
  EyeIcon,
  FileTextIcon,
  GlobeIcon,
  LibraryIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  MousePointerClickIcon,
  PlayCircleIcon,
  SendIcon,
  StarIcon,
  TagsIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import { AnimeCard } from "@/components/anime/anime-card";
import { ErrorState } from "@/components/common/states";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocale, useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useAdminOverview } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  BarRow,
  EmptyBlock,
  ENTER,
  KpiCard,
  LiveDot,
  Panel,
  timeAgo,
  useCountUp,
  useFormatDuration,
  UserAvatar,
  useSafeId,
} from "./admin-ui";

type TimelineKey = "pageviews" | "visitors" | "registrations" | "watchMinutes";
type TrafficMode = "traffic" | "registrations" | "watch";
type Range = "7" | "14" | "30";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function paletteAt(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "var(--chart-1)";
}

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function AdminDashboard() {
  const { data, isPending, isError, refetch } = useAdminOverview();

  if (isPending) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <KpiGrid data={data} />

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <TrafficPanel timeline={data.timeline} className="xl:col-span-2" />
        <AudiencePanel data={data} />
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        <LibraryPanel statuses={data.libraryStatus} />
        <GenresPanel genres={data.topGenres} />
        <HoursPanel hourly={data.hourly} className="md:col-span-2 xl:col-span-1" />
      </div>

      <TopAnimePanel items={data.topAnime} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ReferrersPanel referrers={data.topReferrers} />
        <PagesPanel paths={data.topPaths} />
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <RecentUsersPanel users={data.recentUsers} />
        <RecentCommentsPanel comments={data.recentComments} />
      </div>
    </div>
  );
}

/* ---------------- KPIs ---------------- */

function KpiGrid({ data }: { data: AdminOverview }) {
  const t = useT();
  const formatDuration = useFormatDuration();
  const { kpis, timeline } = data;
  const series = (key: TimelineKey) => timeline.map((point) => point[key]);

  return (
    <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        label={t("admin.kpi.users")}
        icon={<UsersIcon className="size-4" />}
        color="var(--chart-1)"
        kpi={kpis.users}
        series={series("registrations")}
      />
      <KpiCard
        label={t("admin.kpi.visitors")}
        icon={<EyeIcon className="size-4" />}
        color="var(--chart-2)"
        kpi={kpis.visitors}
        series={series("visitors")}
        delay={50}
      />
      <KpiCard
        label={t("admin.kpi.pageviews")}
        icon={<MousePointerClickIcon className="size-4" />}
        color="var(--chart-3)"
        kpi={kpis.pageviews}
        series={series("pageviews")}
        delay={100}
      />
      <KpiCard
        label={t("admin.kpi.watchTime")}
        icon={<PlayCircleIcon className="size-4" />}
        color="var(--chart-5)"
        kpi={kpis.watchSeconds}
        series={series("watchMinutes")}
        format={formatDuration}
        delay={150}
      />
      <KpiCard
        label={t("admin.kpi.comments")}
        icon={<MessageSquareIcon className="size-4" />}
        color="var(--chart-4)"
        kpi={kpis.comments}
        delay={200}
      />
      <KpiCard
        label={t("admin.kpi.reviews")}
        icon={<StarIcon className="size-4" />}
        color="var(--chart-1)"
        kpi={kpis.reviews}
        delay={250}
      />
    </div>
  );
}

/* ---------------- traffic ---------------- */

function TrafficPanel({
  timeline,
  className,
}: {
  timeline: AdminOverview["timeline"];
  className?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const id = useSafeId();
  const [mode, setMode] = useState<TrafficMode>("traffic");
  const [range, setRange] = useState<Range>("30");

  const points = timeline.slice(-Number(range));
  const keys: TimelineKey[] =
    mode === "traffic"
      ? ["pageviews", "visitors"]
      : mode === "registrations"
        ? ["registrations"]
        : ["watchMinutes"];

  const config = {
    pageviews: { label: t("admin.metrics.pageviews"), color: "var(--chart-1)" },
    visitors: { label: t("admin.metrics.visitors"), color: "var(--chart-2)" },
    registrations: { label: t("admin.metrics.registrations"), color: "var(--chart-4)" },
    watchMinutes: { label: t("admin.metrics.watchMinutes"), color: "var(--chart-5)" },
  } satisfies ChartConfig;

  const shortDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const longDay = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <Panel
      className={className}
      icon={<ActivityIcon />}
      title={t("admin.traffic.title")}
      description={t("admin.traffic.description")}
      delay={120}
      action={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          onValueChange={(next) => next && setRange(next as Range)}
        >
          <ToggleGroupItem value="7" className="px-2.5 text-xs">
            {t("admin.range.d7")}
          </ToggleGroupItem>
          <ToggleGroupItem value="14" className="px-2.5 text-xs">
            {t("admin.range.d14")}
          </ToggleGroupItem>
          <ToggleGroupItem value="30" className="px-2.5 text-xs">
            {t("admin.range.d30")}
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["traffic", "registrations", "watch"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                mode === option
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {t(`admin.traffic.mode.${option}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-5">
          {keys.map((key) => (
            <div key={key} className="flex flex-col items-end">
              <span className="text-[11px] text-muted-foreground">{config[key].label}</span>
              <span
                className="font-display text-xl leading-tight tabular-nums"
                style={{ color: config[key].color }}
              >
                {points.reduce((sum, point) => sum + point[key], 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[260px] w-full sm:h-[300px]">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {keys.map((key) => (
              <linearGradient key={key} id={`${id}-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.4} />
                <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={(day: string) => shortDay.format(dayDate(day))}
          />
          <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <ChartTooltip
            cursor={{ strokeDasharray: "4 4" }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(day) => longDay.format(dayDate(String(day)))}
              />
            }
          />
          {keys.map((key) => (
            <Area
              key={`${mode}-${range}-${key}`}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={2.5}
              fill={`url(#${id}-${key})`}
              activeDot={{ r: 5, strokeWidth: 2 }}
              animationDuration={900}
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </Panel>
  );
}

/* ---------------- audience rings ---------------- */

function AudiencePanel({ data }: { data: AdminOverview }) {
  const t = useT();
  const { audience, kpis } = data;
  const animatedTotal = useCountUp(audience.total);
  const share = (count: number) =>
    audience.total > 0 ? Math.round((count / audience.total) * 100) : 0;

  const rings = [
    { key: "newUsers", count: kpis.users.current },
    { key: "telegram", count: audience.telegram },
    { key: "admins", count: audience.admins },
    { key: "banned", count: audience.banned },
  ] as const;

  const config = {
    newUsers: { label: t("admin.audience.newUsers"), color: "var(--chart-1)" },
    telegram: { label: t("admin.audience.telegram"), color: "var(--chart-2)" },
    admins: { label: t("admin.audience.admins"), color: "var(--chart-4)" },
    banned: { label: t("admin.audience.banned"), color: "var(--chart-3)" },
  } satisfies ChartConfig;

  // RadialBarChart draws the first row innermost — reversed so "new users" is the outer ring.
  const chartData = [...rings].reverse().map((ring) => ({
    key: ring.key,
    value: share(ring.count),
    fill: `var(--color-${ring.key})`,
  }));

  return (
    <Panel
      icon={<UsersIcon />}
      title={t("admin.audience.title")}
      description={t("admin.audience.description")}
      delay={180}
    >
      <div className="relative mx-auto aspect-square w-full max-w-[230px]">
        <ChartContainer config={config} className="aspect-square size-full">
          <RadialBarChart
            data={chartData}
            innerRadius="36%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            barSize={11}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background cornerRadius={10} animationDuration={1100} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent hideLabel nameKey="key" valueFormatter={(value) => `${value}%`} />
              }
            />
          </RadialBarChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-3xl leading-none tabular-nums">
              {animatedTotal.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{t("admin.audience.accounts")}</div>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {rings.map((ring) => (
          <li
            key={ring.key}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-2.5 py-2"
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: config[ring.key].color }} />
            <div className="min-w-0">
              <div className="truncate text-[11px] text-muted-foreground">{config[ring.key].label}</div>
              <div className="text-sm font-semibold tabular-nums">
                {ring.count.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{share(ring.count)}%</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-3 rounded-xl bg-primary/8 px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <LiveDot />
          {t("admin.audience.activeToday")}
        </span>
        <span className="font-display text-lg tabular-nums">{audience.activeToday.toLocaleString()}</span>
      </div>
    </Panel>
  );
}

/* ---------------- library statuses ---------------- */

function LibraryPanel({ statuses }: { statuses: AdminOverview["libraryStatus"] }) {
  const t = useT();
  const labels = useLabels();
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  const animatedTotal = useCountUp(total);
  const max = Math.max(...statuses.map((status) => status.count), 1);

  const config: ChartConfig = Object.fromEntries(
    statuses.map((status, i) => [
      status.status,
      { label: labels.statusLabel(status.status), color: paletteAt(i + 1) },
    ]),
  );
  const chartData = statuses
    .filter((status) => status.count > 0)
    .map((status) => ({ ...status, fill: `var(--color-${status.status})` }));

  return (
    <Panel
      icon={<LibraryIcon />}
      title={t("admin.library.title")}
      description={t("admin.library.description")}
      delay={240}
    >
      {total === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative mx-auto aspect-square w-full max-w-[190px]">
            <ChartContainer config={config} className="aspect-square size-full">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="status" />} />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="status"
                  innerRadius="64%"
                  outerRadius="94%"
                  paddingAngle={3}
                  cornerRadius={6}
                  strokeWidth={0}
                  animationDuration={1000}
                />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display text-2xl leading-none tabular-nums">
                  {animatedTotal.toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{t("admin.library.entries")}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {statuses.map((status) => (
              <BarRow
                key={status.status}
                label={labels.statusLabel(status.status)}
                value={status.count}
                max={max}
                color={config[status.status]?.color ?? "var(--chart-1)"}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- genres ---------------- */

function GenresPanel({ genres }: { genres: AdminOverview["topGenres"] }) {
  const t = useT();
  const labels = useLabels();
  const id = useSafeId();
  const data = genres.map((genre) => ({ genre: labels.genreLabel(genre.name), count: genre.count }));
  const config = {
    count: { label: t("admin.genres.titles"), color: "var(--chart-5)" },
  } satisfies ChartConfig;

  return (
    <Panel
      icon={<TagsIcon />}
      title={t("admin.genres.title")}
      description={t("admin.genres.description")}
      delay={300}
    >
      {data.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto h-[300px] w-full [&_.recharts-bar-background-rectangle]:fill-muted/40"
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            barCategoryGap={6}
          >
            <defs>
              <linearGradient id={`${id}-genre`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--color-count)" stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="genre"
              width={96}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey="count"
              fill={`url(#${id}-genre)`}
              radius={8}
              background
              animationDuration={1000}
            />
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/* ---------------- hours radar ---------------- */

function HoursPanel({ hourly, className }: { hourly: AdminOverview["hourly"]; className?: string }) {
  const t = useT();
  // The server buckets by UTC hour; shift onto the admin's own clock.
  const offset = Math.round(-new Date().getTimezoneOffset() / 60);
  const data = hourly
    .map((point) => ({ hour: (((point.hour + offset) % 24) + 24) % 24, pageviews: point.pageviews }))
    .sort((a, b) => a.hour - b.hour);
  const peak = data.reduce(
    (best, point) => (point.pageviews > best.pageviews ? point : best),
    { hour: 0, pageviews: 0 },
  );
  const config = {
    pageviews: { label: t("admin.metrics.pageviews"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  return (
    <Panel
      className={className}
      icon={<ClockIcon />}
      title={t("admin.hours.title")}
      description={t("admin.hours.description")}
      delay={360}
    >
      {peak.pageviews === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <>
          <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[270px]">
            <RadarChart data={data} outerRadius="74%">
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent labelFormatter={(hour) => hourLabel(Number(hour))} />}
              />
              <PolarGrid gridType="circle" />
              <PolarAngleAxis
                dataKey="hour"
                tick={{ fontSize: 10 }}
                tickFormatter={(hour: number) => (hour % 3 === 0 ? String(hour) : "")}
              />
              <Radar
                dataKey="pageviews"
                stroke="var(--color-pageviews)"
                fill="var(--color-pageviews)"
                fillOpacity={0.3}
                strokeWidth={2}
                dot={{ r: 2.5, fillOpacity: 1 }}
                animationDuration={1000}
              />
            </RadarChart>
          </ChartContainer>
          <div className="mt-auto flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("admin.hours.peak")}</span>
            <span className="font-semibold tabular-nums">
              {hourLabel(peak.hour)} · {peak.pageviews.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---------------- top anime ---------------- */

const MEDALS = [
  "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950",
  "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900",
  "bg-gradient-to-br from-orange-200 to-orange-600 text-orange-950",
];

function TopAnimePanel({ items }: { items: AdminOverview["topAnime"] }) {
  const t = useT();
  return (
    <Panel
      icon={<TrophyIcon />}
      title={t("admin.topAnime.title")}
      description={t("admin.topAnime.description")}
      delay={420}
    >
      {items.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((item, index) => (
            <div
              key={item.anime.id}
              style={{ animationDelay: `${460 + index * 45}ms` }}
              className={cn(ENTER, "relative flex min-w-0 flex-col gap-2")}
            >
              <span
                className={cn(
                  "absolute -right-1.5 -top-2 z-20 grid size-8 place-items-center rounded-full border-2 border-background font-display text-sm shadow-md",
                  MEDALS[index] ?? "bg-muted text-foreground",
                )}
              >
                {index + 1}
              </span>
              <AnimeCard anime={item.anime} />
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1 text-muted-foreground" title={t("admin.topAnime.views")}>
                  <EyeIcon className="size-3.5" />
                  <b className="font-semibold text-foreground">{item.views.toLocaleString()}</b>
                </span>
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground"
                  title={t("admin.topAnime.watchers")}
                >
                  <UsersIcon className="size-3.5" />
                  <b className="font-semibold text-foreground">{item.watchers.toLocaleString()}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- referrers & pages ---------------- */

function ReferrersPanel({ referrers }: { referrers: AdminOverview["topReferrers"] }) {
  const t = useT();
  const total = referrers.reduce((sum, referrer) => sum + referrer.count, 0);
  const max = Math.max(...referrers.map((referrer) => referrer.count), 1);
  const hostLabel = (host: string) =>
    host === "direct"
      ? t("admin.referrers.direct")
      : host === "unknown"
        ? t("admin.referrers.unknown")
        : host;

  const rows = referrers.map((referrer, i) => ({
    key: `ref${i}`,
    label: hostLabel(referrer.host),
    count: referrer.count,
    color: paletteAt(i),
  }));
  const config: ChartConfig = Object.fromEntries(
    rows.map((row) => [row.key, { label: row.label, color: row.color }]),
  );
  const chartData = rows.map((row) => ({ key: row.key, count: row.count, fill: `var(--color-${row.key})` }));

  return (
    <Panel
      icon={<GlobeIcon />}
      title={t("admin.referrers.title")}
      description={t("admin.referrers.description")}
      delay={480}
    >
      {total === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,170px)_1fr]">
          <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[170px]">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="key"
                innerRadius="58%"
                outerRadius="94%"
                paddingAngle={2}
                cornerRadius={5}
                strokeWidth={0}
                animationDuration={1000}
              />
            </PieChart>
          </ChartContainer>
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <BarRow
                key={row.key}
                label={
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
                    {row.label}
                  </span>
                }
                value={row.count}
                max={max}
                color={row.color}
                suffix={`${Math.round((row.count / total) * 100)}%`}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function PagesPanel({ paths }: { paths: AdminOverview["topPaths"] }) {
  const t = useT();
  const max = Math.max(...paths.map((path) => path.count), 1);
  return (
    <Panel
      icon={<FileTextIcon />}
      title={t("admin.pages.title")}
      description={t("admin.pages.description")}
      delay={540}
    >
      {paths.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <div className="flex flex-col gap-3">
          {paths.map((path, i) => (
            <BarRow
              key={path.path}
              label={
                <Link to={path.path} className="font-mono text-xs hover:text-primary hover:underline">
                  {path.path}
                </Link>
              }
              value={path.count}
              max={max}
              color={paletteAt(i)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- recent activity ---------------- */

function RecentUsersPanel({ users }: { users: AdminOverview["recentUsers"] }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Panel
      icon={<UserPlusIcon />}
      title={t("admin.recentUsers.title")}
      description={t("admin.recentUsers.description")}
      delay={600}
    >
      {users.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ul className="-my-1 divide-y divide-border/50">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-2.5">
              <UserAvatar name={user.displayName} url={user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{user.displayName}</span>
                  {user.hasTelegram && <SendIcon className="size-3.5 shrink-0 text-sky-500" />}
                </div>
                <div className="text-xs text-muted-foreground">{timeAgo(user.createdAt, locale)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentCommentsPanel({ comments }: { comments: AdminOverview["recentComments"] }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Panel
      icon={<MessagesSquareIcon />}
      title={t("admin.recentComments.title")}
      description={t("admin.recentComments.description")}
      delay={660}
    >
      {comments.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ul className="-my-1 divide-y divide-border/50">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 py-2.5">
              <UserAvatar name={comment.authorName} url={comment.authorAvatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm">
                  <span className="font-medium">{comment.authorName}</span>
                  <span className="text-xs text-muted-foreground">{t("admin.recentComments.on")}</span>
                  <Link
                    to={`/anime/${comment.animeId}`}
                    className="min-w-0 truncate text-xs font-medium text-primary hover:underline"
                  >
                    {comment.animeTitle}
                  </Link>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-foreground/80">{comment.body}</p>
                <div className="mt-1 text-[11px] text-muted-foreground">{timeAgo(comment.createdAt, locale)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <Skeleton className="h-[420px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
