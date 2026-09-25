import type { AdminAudienceStats, AdminOverview, AdminWindow } from "@animeshadow/shared";
import {
  ClapperboardIcon,
  EyeIcon,
  GlobeIcon,
  type LucideIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PlayCircleIcon,
  TimerIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import { useLocale, useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useAdminOverview } from "@/lib/query";
import { cn } from "@/lib/utils";
import { AnimeThumb, EmptyBlock, ENTER, Panel, timeAgo, UserAvatar, useFormatDuration } from "./admin-ui";

/** Signed-in visitors and guests — the two columns everything here is split by. */
const REGISTERED = "var(--chart-1)";
const GUESTS = "var(--chart-2)";

const WINDOWS: AdminWindow[] = ["today", "7d", "30d"];

/**
 * The overview, built around one question the old dashboard couldn't
 * answer: how much of the site is used by people without an account? Every
 * number that a guest can produce is shown in two columns — registered and
 * guests — with the guest share next to it, for today, 7 or 30 days.
 */
export function AdminOverviewTab() {
  const t = useT();
  const { data, isPending, isError, refetch } = useAdminOverview();
  const [window, setWindow] = useState<AdminWindow>("7d");

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <OverviewSkeleton />;

  const split = data.split.find((s) => s.window === window) ?? data.split[0]!;

  return (
    <div className="flex flex-col gap-5">
      <div className={cn(ENTER, "grid grid-cols-2 gap-3 lg:grid-cols-4")}>
        <Stat icon={UsersIcon} label={t("admin.kpi.users")} value={data.kpis.users.total} note={t("admin.x.newIn30", { n: data.kpis.users.current })} />
        <Stat
          icon={GlobeIcon}
          label={t("admin.x.visitors30")}
          value={data.kpis.visitors.current}
          note={t("admin.x.guestShare", { p: share(data.split[2]?.guests.visitors ?? 0, data.split[2]?.registered.visitors ?? 0) })}
        />
        <Stat icon={EyeIcon} label={t("admin.x.pageviews30")} value={data.kpis.pageviews.current} note={t("admin.x.allTime", { n: data.kpis.pageviews.total.toLocaleString() })} />
        <Stat icon={MessageSquareIcon} label={t("admin.kpi.comments")} value={data.kpis.comments.total} note={t("admin.x.newIn30", { n: data.kpis.comments.current })} />
      </div>

      <Panel
        icon={<UsersIcon />}
        title={t("admin.x.splitTitle")}
        description={t("admin.x.splitHint")}
        action={<WindowSwitch value={window} onChange={setWindow} />}
      >
        <SplitTable registered={split.registered} guests={split.guests} />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <TrendPanel timeline={data.timeline} kind="pageviews" />
        <TrendPanel timeline={data.timeline} kind="watch" />
      </div>

      <TopAnimePanel items={data.topAnime} />

      <div className="grid gap-5 lg:grid-cols-3">
        <ListPanel
          icon={<MousePointerClickIcon />}
          title={t("admin.pages.title")}
          description={t("admin.pages.description")}
          rows={data.topPaths.map((p) => ({ label: p.path, value: p.count }))}
        />
        <ListPanel
          icon={<TrendingUpIcon />}
          title={t("admin.referrers.title")}
          description={t("admin.referrers.description")}
          rows={data.topReferrers.map((r) => ({
            label: r.host === "direct" ? t("admin.referrers.direct") : r.host === "unknown" ? t("admin.referrers.unknown") : r.host,
            value: r.count,
          }))}
        />
        <RecentUsers users={data.recentUsers} />
      </div>
    </div>
  );
}

function share(guests: number, registered: number): number {
  const total = guests + registered;
  return total === 0 ? 0 : Math.round((guests / total) * 100);
}

function Stat({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: number; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="font-display text-2xl tabular-nums sm:text-3xl">{value.toLocaleString()}</span>
      <span className="truncate text-[11px] text-muted-foreground">{note}</span>
    </div>
  );
}

function WindowSwitch({ value, onChange }: { value: AdminWindow; onChange: (w: AdminWindow) => void }) {
  const t = useT();
  return (
    <div className="flex rounded-lg border border-primary/25 bg-primary/5 p-0.5">
      {WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          aria-pressed={value === w}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            value === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
          )}
        >
          {t(`admin.x.windows.${w}` as "admin.x.windows.today")}
        </button>
      ))}
    </div>
  );
}

/** Rows are measures, columns are audiences — the guest column is the point. */
function SplitTable({ registered, guests }: { registered: AdminAudienceStats; guests: AdminAudienceStats }) {
  const t = useT();
  const duration = useFormatDuration();
  const rows: Array<{ key: keyof AdminAudienceStats; icon: LucideIcon; format?: (n: number) => string }> = [
    { key: "visitors", icon: UsersIcon },
    { key: "pageviews", icon: EyeIcon },
    { key: "animeViews", icon: ClapperboardIcon },
    { key: "titles", icon: TrophyIcon },
    { key: "watchSessions", icon: PlayCircleIcon },
    { key: "watchSeconds", icon: TimerIcon, format: duration },
  ];
  const fmt = (n: number, f?: (n: number) => string) => (f ? f(n) : n.toLocaleString());

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1 font-semibold" />
            <th className="px-2 py-1 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: REGISTERED }} />
                {t("admin.x.registered")}
              </span>
            </th>
            <th className="px-2 py-1 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: GUESTS }} />
                {t("admin.x.guests")}
              </span>
            </th>
            <th className="px-2 py-1 font-semibold">{t("admin.x.total")}</th>
            <th className="w-40 px-2 py-1 font-semibold">{t("admin.x.guestPart")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, icon: Icon, format }) => {
            const r = registered[key];
            const g = guests[key];
            const p = share(g, r);
            return (
              <tr key={key} className="bg-card/50 transition-colors hover:bg-primary/[0.06]">
                <td className="rounded-l-lg px-2 py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-primary" />
                    {t(`admin.x.rows.${key}` as "admin.x.rows.visitors")}
                  </span>
                </td>
                <td className="px-2 py-2 tabular-nums">{fmt(r, format)}</td>
                <td className="px-2 py-2 tabular-nums">{fmt(g, format)}</td>
                <td className="px-2 py-2 font-semibold tabular-nums">{fmt(r + g, format)}</td>
                <td className="rounded-r-lg px-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="flex h-2 flex-1 overflow-hidden rounded-full">
                      <span style={{ width: `${100 - p}%`, background: REGISTERED }} />
                      <span className="ml-0.5" style={{ width: `${p}%`, background: GUESTS }} />
                    </span>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{p}%</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendPanel({ timeline, kind }: { timeline: AdminOverview["timeline"]; kind: "pageviews" | "watch" }) {
  const t = useT();
  const { locale } = useLocale();
  const data = timeline.map((d) => ({
    date: d.date,
    registered: kind === "pageviews" ? d.pageviews - d.guestPageviews : d.watchMinutes,
    guests: kind === "pageviews" ? d.guestPageviews : d.guestWatchMinutes,
  }));
  const config = {
    registered: { label: t("admin.x.registered"), color: REGISTERED },
    guests: { label: t("admin.x.guests"), color: GUESTS },
  } satisfies ChartConfig;
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const empty = data.every((d) => d.registered === 0 && d.guests === 0);

  return (
    <Panel
      icon={kind === "pageviews" ? <EyeIcon /> : <TimerIcon />}
      title={t(kind === "pageviews" ? "admin.x.trendViews" : "admin.x.trendWatch")}
      description={t("admin.x.trendHint")}
    >
      {empty ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-60 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(v: string) => day.format(new Date(v))}
            />
            <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(v) => day.format(new Date(String(v)))} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area dataKey="registered" type="monotone" stackId="a" stroke={REGISTERED} fill={REGISTERED} fillOpacity={0.25} strokeWidth={2} />
            <Area dataKey="guests" type="monotone" stackId="a" stroke={GUESTS} fill={GUESTS} fillOpacity={0.25} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

function TopAnimePanel({ items }: { items: AdminOverview["topAnime"] }) {
  const t = useT();
  const labels = useLabels();
  const duration = useFormatDuration();
  const max = Math.max(1, ...items.map((i) => i.viewsRegistered + i.viewsGuests));

  return (
    <Panel icon={<TrophyIcon />} title={t("admin.topAnime.title")} description={t("admin.x.topHint")}>
      {items.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1 font-semibold">#</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.title")}</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.opens")}</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.registered")}</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.guests")}</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.watchReg")}</th>
                <th className="px-2 py-1 font-semibold">{t("admin.x.watchGuests")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const total = item.viewsRegistered + item.viewsGuests;
                return (
                  <tr key={item.anime.id} className="bg-card/50 transition-colors hover:bg-primary/[0.06]">
                    <td className="rounded-l-lg px-2 py-1.5 font-display text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <AnimeThumb id={item.anime.id} slug={item.anime.slug} title={labels.title(item.anime)} imageUrl={item.anime.imageUrl} />
                    </td>
                    <td className="w-44 px-2 py-1.5">
                      <span className="flex h-2 overflow-hidden rounded-full bg-foreground/5" title={`${total}`}>
                        <span style={{ width: `${(item.viewsRegistered / max) * 100}%`, background: REGISTERED }} />
                        <span style={{ width: `${(item.viewsGuests / max) * 100}%`, background: GUESTS }} />
                      </span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{item.viewsRegistered.toLocaleString()}</td>
                    <td className="px-2 py-1.5 tabular-nums">{item.viewsGuests.toLocaleString()}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{duration(item.watchSecondsRegistered)}</td>
                    <td className="rounded-r-lg px-2 py-1.5 tabular-nums text-muted-foreground">{duration(item.watchSecondsGuests)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ListPanel({
  icon,
  title,
  description,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const t = useT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Panel icon={icon} title={title} description={description}>
      {rows.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">{row.value.toLocaleString()}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-foreground/5">
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(row.value / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentUsers({ users }: { users: AdminOverview["recentUsers"] }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Panel icon={<UserPlusIcon />} title={t("admin.recentUsers.title")} description={t("admin.recentUsers.description")}>
      {users.length === 0 ? (
        <EmptyBlock>{t("admin.empty")}</EmptyBlock>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5">
              <UserAvatar name={u.displayName} url={u.avatarUrl} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.displayName}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(u.createdAt, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
