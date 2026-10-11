import type {
  AdminAnalytics,
  AdminAnalyticsBreakdownGroup,
  AdminAnalyticsBreakdowns,
  AdminAnalyticsQuery,
  AdminAnalyticsRow,
  AdminAnalyticsSummary,
  AdminVisitor,
  AdminVisitorsQuery,
} from "@animeshadow/shared";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BotIcon,
  CalendarRangeIcon,
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  CpuIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FlameIcon,
  GlobeIcon,
  LayersIcon,
  type LucideIcon,
  MonitorSmartphoneIcon,
  RepeatIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, ComposedChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { EmptyBlock, LiveDot, Panel, UserAvatar } from "@/components/admin/admin-ui";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInView } from "@/hooks/use-in-view";
import {
  useAdminAnalytics,
  useAdminAnalyticsLive,
  useAdminArchive,
  useAdminArchiveMonth,
  useAdminBreakdowns,
  useAdminExternalAnalytics,
  useAdminHeatmap,
  useAdminRetention,
  useAdminVisitor,
  useAdminVisitors,
} from "@/lib/query";
import { cn } from "@/lib/utils";

/*
 * The admin's analytics tab. Russian only, like the rest of the admin in
 * practice (the English locale is switched off site-wide).
 *
 * Everything below reads one filter set: a period, an audience, a device,
 * a page filter and whether crawlers count. Every number is shown against
 * the period of the same length right before it.
 */

const DAY = 86_400_000;
const PRESETS = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
  { key: "90d", label: "90 дней" },
  { key: "365d", label: "Год" },
  { key: "custom", label: "Свой" },
] as const;
type Preset = (typeof PRESETS)[number]["key"];

const AUDIENCES = [
  { key: "all", label: "Все" },
  { key: "guests", label: "Гости" },
  { key: "users", label: "Вошедшие" },
] as const;

const DEVICES = [
  { key: "all", label: "Все устройства" },
  { key: "mobile", label: "Телефоны" },
  { key: "tablet", label: "Планшеты" },
  { key: "desktop", label: "Компьютеры" },
] as const;

const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
  } catch {
    return "Europe/Moscow";
  }
})();

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rangeFor(preset: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now).toISOString(), to: now.toISOString() };
    case "yesterday": {
      const end = startOfDay(now);
      return { from: new Date(end.getTime() - DAY).toISOString(), to: end.toISOString() };
    }
    case "custom": {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : new Date(now.getTime() - 30 * DAY);
      const to = custom.to ? new Date(new Date(`${custom.to}T00:00:00`).getTime() + DAY) : now;
      return { from: from.toISOString(), to: to.toISOString() };
    }
    default: {
      const days = Number.parseInt(preset, 10);
      // Rounded to the minute, so the query key doesn't change on every render.
      const end = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      return { from: new Date(end.getTime() - days * DAY).toISOString(), to: end.toISOString() };
    }
  }
}

const nf = new Intl.NumberFormat("ru-RU");
const fmt = (n: number) => nf.format(n);
const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")}%`;
function duration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} с`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин ${Math.round(sec % 60)} с`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

/** Rows to CSV, with a BOM so Excel opens Cyrillic correctly. */
function downloadCsv(name: string, header: string[], rows: Array<Array<string | number | null>>) {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminAnalyticsTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [audience, setAudience] = useState<AdminAnalyticsQuery["audience"]>("all");
  const [device, setDevice] = useState<AdminAnalyticsQuery["device"]>("all");
  const [pathInput, setPathInput] = useState("");
  const path = useDebouncedValue(pathInput.trim(), 400);
  const [bots, setBots] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom.from, custom.to]);
  const params: Partial<AdminAnalyticsQuery> = {
    ...range,
    audience,
    device,
    tz: TZ,
    ...(path ? { path } : {}),
    ...(bots ? { bots: true } : {}),
  };
  const query = useAdminAnalytics(params);
  const live = useAdminAnalyticsLive(params);
  const data = query.data;
  // Raw page views are kept for a few months; a period reaching further
  // back is only partly here — the rest is in the archive below.
  const beyondRaw = data?.rawSince != null && new Date(range.from) < new Date(data.rawSince);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters: one row, above everything they change. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-2.5">
        <Segmented value={preset} options={PRESETS} onChange={setPreset} />
        {preset === "custom" && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRangeIcon className="size-3.5" />
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="h-8 rounded-md border border-border/60 bg-background/60 px-2 text-xs text-foreground"
            />
            —
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="h-8 rounded-md border border-border/60 bg-background/60 px-2 text-xs text-foreground"
            />
          </span>
        )}
        <Segmented value={audience} options={AUDIENCES} onChange={setAudience} />
        <Select value={device} onValueChange={(v) => setDevice(v as AdminAnalyticsQuery["device"])}>
          <SelectTrigger size="sm" className="w-full text-xs sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICES.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="relative min-w-0 flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Страница содержит… (/anime)"
            className="h-8 w-full rounded-md border border-border/60 bg-background/60 pl-8 pr-2 text-xs outline-none focus:border-foreground/30 sm:w-52"
          />
        </span>
        <button
          type="button"
          onClick={() => setBots((b) => !b)}
          aria-pressed={bots}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            bots ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          <BotIcon className="size-3.5" />
          Боты
        </button>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {query.isFetching && <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          {live.data && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">
              <LiveDot />
              Сейчас на сайте: <b className="tabular-nums">{live.data.visitors}</b>
            </span>
          )}
        </span>
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
          <Skeleton className="h-72 rounded-2xl sm:col-span-2 lg:col-span-4" />
        </div>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", query.isPlaceholderData && "opacity-60")}>
          {beyondRaw && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Подробные данные хранятся с {new Date(data.rawSince!).toLocaleDateString("ru-RU")} — за более ранние дни есть
              итоги по дням в блоке «Архив» внизу.
            </p>
          )}
          <Kpis now={data.summary} before={data.previous} />
          <TrendPanel data={data} />
          {/* Everything below loads its own data once scrolled to. */}
          <div className="grid gap-4 xl:grid-cols-2">
            <HeatmapPanel params={params} />
            <RetentionPanel params={params} />
          </div>
          <BreakdownsPanel params={params} />
          <VisitorsPanel filters={params} />
          <ArchivePanel />
          <ExternalPanel />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    // One line that scrolls sideways on a phone, never a word broken in two.
    <div className="flex max-w-full overflow-x-auto rounded-lg border border-border/60 bg-background/40 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -- KPIs ---------------------------------------------------------------- */

interface KpiDef {
  key: keyof AdminAnalyticsSummary;
  label: string;
  hint: string;
  icon: LucideIcon;
  format?: (n: number) => string;
  /** A lower number is the good direction (bounce rate). */
  lowerIsBetter?: boolean;
}

const KPIS: KpiDef[] = [
  { key: "visitors", label: "Уникальные посетители", hint: "Разные браузеры за период", icon: UsersIcon },
  { key: "newVisitors", label: "Новые", hint: "Впервые пришли в этом периоде", icon: FlameIcon },
  { key: "returningVisitors", label: "Вернувшиеся", hint: "Бывали раньше и пришли снова", icon: RepeatIcon },
  { key: "users", label: "Вошедшие пользователи", hint: "Уникальные аккаунты", icon: UserIcon },
  { key: "sessions", label: "Визиты (сессии)", hint: "Новая сессия — после 30 мин тишины", icon: ActivityIcon },
  { key: "pageviews", label: "Просмотры страниц", hint: "Все открытия страниц", icon: LayersIcon },
  { key: "pagesPerSession", label: "Глубина", hint: "Страниц за визит", icon: CompassIcon, format: (n) => n.toFixed(1).replace(".", ",") },
  { key: "bounceRate", label: "Отказы", hint: "Визиты из одной страницы", icon: ArrowDownIcon, format: pct, lowerIsBetter: true },
  { key: "avgSessionSec", label: "Длительность визита", hint: "В среднем", icon: CalendarRangeIcon, format: duration },
  { key: "avgPageSec", label: "Время на странице", hint: "Пока вкладка была открыта на экране", icon: MonitorSmartphoneIcon, format: duration },
  { key: "registrations", label: "Регистрации", hint: "Новые аккаунты", icon: UserIcon },
  { key: "watchMinutes", label: "Просмотр видео", hint: "Минут в плеере", icon: ActivityIcon, format: (n) => `${fmt(n)} мин` },
];

function Kpis({ now, before }: { now: AdminAnalyticsSummary; before: AdminAnalyticsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {KPIS.map((k) => {
        const value = now[k.key];
        const prev = before[k.key];
        const delta = prev > 0 ? (value - prev) / prev : null;
        const good = delta == null || delta === 0 ? null : k.lowerIsBetter ? delta < 0 : delta > 0;
        const Icon = k.icon;
        return (
          <div key={k.key} title={k.hint} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3.5">
            <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Icon className="mt-px size-3.5 shrink-0" />
              <span className="line-clamp-2 leading-tight">{k.label}</span>
            </span>
            <span className="font-display text-xl tabular-nums sm:text-2xl">{(k.format ?? fmt)(value)}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {delta == null ? (
                <span>без сравнения</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                      good == null ? "text-muted-foreground" : good ? "text-emerald-500" : "text-rose-500",
                    )}
                  >
                    {delta > 0 ? <ArrowUpIcon className="size-3" /> : delta < 0 ? <ArrowDownIcon className="size-3" /> : null}
                    {`${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}%`}
                  </span>
                  <span className="truncate">было {(k.format ?? fmt)(prev)}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -- Trend --------------------------------------------------------------- */

const METRICS = [
  { key: "visitors", label: "Посетители" },
  { key: "newVisitors", label: "Новые" },
  { key: "users", label: "Вошедшие" },
  { key: "sessions", label: "Визиты" },
  { key: "pageviews", label: "Просмотры" },
  { key: "registrations", label: "Регистрации" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

/** The current period in the site colour; the one before as a dashed grey
 *  reference line. One measure at a time, one axis. */
const CURRENT = "var(--primary)";
const PREVIOUS = "var(--muted-foreground)";

function TrendPanel({ data }: { data: AdminAnalytics }) {
  const [metric, setMetric] = useState<Metric>("visitors");
  const hourly = data.range.bucket === "hour";
  const label = METRICS.find((m) => m.key === metric)!.label;
  const rows = data.series.map((p, i) => ({
    at: p.at,
    current: p[metric],
    previous: data.previousSeries[i]?.[metric] ?? null,
  }));
  const config = {
    current: { label: `${label} — этот период`, color: CURRENT },
    previous: { label: `${label} — прошлый период`, color: PREVIOUS },
  } satisfies ChartConfig;
  const tick = (v: string) => {
    const d = new Date(`${v}:00Z`);
    return hourly
      ? `${String(d.getUTCHours()).padStart(2, "0")}:00`
      : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const empty = rows.every((r) => !r.current);

  return (
    <Panel
      title="Динамика"
      description={hourly ? "По часам" : "По дням"}
      icon={<ActivityIcon />}
      action={<Segmented value={metric} options={METRICS} onChange={setMetric} />}
    >
      {empty ? (
        <EmptyBlock>За этот период данных нет</EmptyBlock>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.25} />
              <XAxis dataKey="at" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={tick} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => tick(String(v))} />} />
              <Line dataKey="previous" type="monotone" stroke={PREVIOUS} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              <Area dataKey="current" type="monotone" stroke={CURRENT} fill={CURRENT} fillOpacity={0.15} strokeWidth={2} />
            </ComposedChart>
          </ChartContainer>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded-full" style={{ background: CURRENT }} />
              Этот период
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} />
              Прошлый период такой же длины
            </span>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "динамика",
                  ["Время", "Посетители", "Новые", "Вошедшие", "Визиты", "Просмотры", "Регистрации"],
                  data.series.map((p) => [p.at, p.visitors, p.newVisitors, p.users, p.sessions, p.pageviews, p.registrations]),
                )
              }
              className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
            >
              <DownloadIcon className="size-3.5" />
              CSV
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* -- Heatmap --------------------------------------------------------------- */

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function HeatmapPanel({ params }: { params: Partial<AdminAnalyticsQuery> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { data: cells = [], isPending } = useAdminHeatmap(params, seen);
  const grid = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.pageviews]));
  const max = Math.max(1, ...cells.map((c) => c.pageviews));
  return (
    <Panel title="Когда заходят" description="День недели × час, просмотры страниц" icon={<CalendarRangeIcon />}>
      <div ref={ref} className={cn("overflow-x-auto transition-opacity", isPending && "opacity-40")}>
        <div className="grid min-w-[34rem] grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-[2px] text-[10px] text-muted-foreground">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center tabular-nums">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {DOW.map((label, i) => {
            const dow = (i + 1) % 7; // Monday first; Postgres counts Sunday as 0
            return [
              <span key={`l${i}`} className="self-center">
                {label}
              </span>,
              ...Array.from({ length: 24 }, (_, h) => {
                const n = grid.get(`${dow}:${h}`) ?? 0;
                return (
                  <span
                    key={`${i}-${h}`}
                    title={`${label}, ${h}:00–${h + 1}:00 — ${fmt(n)} просмотров`}
                    className="aspect-square rounded-[3px]"
                    style={{
                      background: n === 0 ? "color-mix(in srgb, var(--foreground) 5%, transparent)" : `color-mix(in srgb, var(--primary) ${Math.round(12 + (n / max) * 88)}%, transparent)`,
                    }}
                  />
                );
              }),
            ];
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        меньше
        {[12, 34, 56, 78, 100].map((p) => (
          <span key={p} className="size-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--primary) ${p}%, transparent)` }} />
        ))}
        больше · пик {fmt(max)}
      </div>
    </Panel>
  );
}

/* -- Retention ------------------------------------------------------------ */

function RetentionPanel({ params }: { params: Partial<AdminAnalyticsQuery> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { data: retention, isPending } = useAdminRetention(params, seen);
  return (
    <Panel title="Возвращаемость" description="Кто впервые пришёл на неделе — сколько вернулись через 1–4 недели" icon={<RepeatIcon />}>
      <div ref={ref} />
      {!retention ? (
        <Skeleton className={cn("h-40 rounded-xl", !isPending && "hidden")} />
      ) : retention.length === 0 ? (
        <EmptyBlock>Новых посетителей в этом периоде нет</EmptyBlock>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-xs">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 font-medium">Неделя</th>
                <th className="py-1.5 text-right font-medium">Новых</th>
                {[1, 2, 3, 4].map((w) => (
                  <th key={w} className="py-1.5 text-center font-medium">
                    +{w} нед.
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retention.map((row) => (
                <tr key={row.week} className="border-t border-border/40">
                  <td className="py-1.5 tabular-nums">{new Date(row.week).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(row.visitors)}</td>
                  {row.returned.map((n, i) => {
                    const share = row.visitors > 0 ? n / row.visitors : 0;
                    return (
                      <td key={i} className="p-0.5">
                        <span
                          title={`${fmt(n)} из ${fmt(row.visitors)}`}
                          className="block rounded px-1 py-1 text-center tabular-nums"
                          style={{ background: share > 0 ? `color-mix(in srgb, var(--primary) ${Math.round(10 + share * 90)}%, transparent)` : undefined }}
                        >
                          {share > 0 ? pct(share) : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* -- Breakdowns ------------------------------------------------------------ */

const GROUPS: Array<{
  key: AdminAnalyticsBreakdownGroup;
  label: string;
  icon: LucideIcon;
  tables: Array<{ key: keyof AdminAnalyticsBreakdowns; label: string; first: string }>;
}> = [
  {
    key: "pages",
    label: "Страницы",
    icon: LayersIcon,
    tables: [
      { key: "pages", label: "Все страницы", first: "Страница" },
      { key: "sections", label: "Разделы", first: "Раздел" },
      { key: "entryPages", label: "Страницы входа", first: "С чего начали визит" },
      { key: "anime", label: "Аниме", first: "Тайтл" },
    ],
  },
  {
    key: "sources",
    label: "Источники",
    icon: GlobeIcon,
    tables: [
      { key: "referrers", label: "Сайты-источники", first: "Откуда пришли" },
      { key: "utmSources", label: "UTM source", first: "utm_source" },
      { key: "utmCampaigns", label: "UTM campaign", first: "utm_campaign" },
    ],
  },
  {
    key: "tech",
    label: "Устройства",
    icon: CpuIcon,
    tables: [
      { key: "devices", label: "Тип устройства", first: "Устройство" },
      { key: "browsers", label: "Браузеры", first: "Браузер" },
      { key: "os", label: "ОС", first: "Система" },
      { key: "screens", label: "Экраны", first: "Ширина окна" },
      { key: "langs", label: "Языки", first: "Язык" },
    ],
  },
];

const DEVICE_RU: Record<string, string> = { mobile: "Телефон", tablet: "Планшет", desktop: "Компьютер", bot: "Бот" };

function BreakdownsPanel({ params }: { params: Partial<AdminAnalyticsQuery> }) {
  const [group, setGroup] = useState<AdminAnalyticsBreakdownGroup>(GROUPS[0]!.key);
  const current = GROUPS.find((g) => g.key === group)!;
  const [table, setTable] = useState(current.tables[0]!.key);
  const def = current.tables.find((t) => t.key === table) ?? current.tables[0]!;
  const [ref, seen] = useInView<HTMLDivElement>();
  // Only the group on screen is asked for — three groups, twelve tables.
  const { data: tables, isFetching } = useAdminBreakdowns(params, group, seen);
  const rowsOf = (key: keyof AdminAnalyticsBreakdowns) => tables?.[key] ?? [];

  return (
    <Panel
      title="Разрезы"
      description="Сортировка по любому столбцу, поиск, выгрузка в CSV"
      icon={<LayersIcon />}
      action={
        <Segmented
          value={group}
          options={GROUPS.map((g) => ({ key: g.key, label: g.label }))}
          onChange={(g) => {
            setGroup(g as AdminAnalyticsBreakdownGroup);
            setTable(GROUPS.find((x) => x.key === g)!.tables[0]!.key);
          }}
        />
      }
    >
      <div className="flex flex-wrap gap-1">
        {current.tables.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTable(t.key)}
            aria-pressed={def.key === t.key}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              def.key === t.key ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {tables?.[t.key] && <span className="ml-1 tabular-nums opacity-60">{tables[t.key]!.length}</span>}
          </button>
        ))}
      </div>
      <div ref={ref} className={cn("transition-opacity", isFetching && "opacity-60")}>
        {tables ? (
          <BreakdownTable
            key={def.key}
            name={def.label}
            first={def.first}
            rows={rowsOf(def.key).map((r) => (def.key === "devices" ? { ...r, label: DEVICE_RU[r.key] ?? r.key } : r))}
            linkable={def.key === "pages" || def.key === "entryPages" || def.key === "anime"}
          />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </div>
    </Panel>
  );
}

type SortKey = "key" | "pageviews" | "visitors" | "avgSec";

function BreakdownTable({ name, first, rows, linkable }: { name: string; first: string; rows: AdminAnalyticsRow[]; linkable: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "pageviews", dir: -1 });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);
  const total = rows.reduce((n, r) => n + r.pageviews, 0) || 1;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? rows.filter((r) => `${r.key} ${r.label ?? ""}`.toLowerCase().includes(needle)) : rows;
    return [...filtered].sort((a, b) => {
      const av = sort.key === "key" ? (a.label ?? a.key) : (a[sort.key] ?? -1);
      const bv = sort.key === "key" ? (b.label ?? b.key) : (b[sort.key] ?? -1);
      return (typeof av === "string" ? av.localeCompare(String(bv), "ru") : (av as number) - (bv as number)) * sort.dir;
    });
  }, [rows, q, sort]);

  if (rows.length === 0) return <EmptyBlock>Здесь пока пусто — данные появятся с новыми визитами</EmptyBlock>;

  const head = (key: SortKey, label: string, align = "text-right") => (
    <th className={cn("py-2 font-medium", align)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "key" ? 1 : -1 }))}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === key && "text-foreground")}
      >
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск в таблице"
            className="h-8 w-56 rounded-md border border-border/60 bg-background/60 pl-8 pr-2 text-xs outline-none focus:border-foreground/30"
          />
        </span>
        <span className="text-xs text-muted-foreground">
          {fmt(shown.length)} строк
        </span>
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              name,
              [first, "Просмотры", "Посетители", "Доля просмотров", "Ср. время, с"],
              shown.map((r) => [r.label ?? r.key, r.pageviews, r.visitors, (r.pageviews / total).toFixed(4), r.avgSec]),
            )
          }
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <DownloadIcon className="size-3.5" />
          CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-xs">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              {head("key", first, "text-left")}
              {head("pageviews", "Просмотры")}
              {head("visitors", "Посетители")}
              <th className="w-40 py-2 text-right font-medium">Доля</th>
              {head("avgSec", "Ср. время")}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r) => {
              const share = r.pageviews / total;
              const text = r.label ?? r.key;
              return (
                <tr key={r.key} className="border-t border-border/40 hover:bg-foreground/[0.03]">
                  <td className="max-w-[22rem] truncate py-1.5 pr-3" title={r.key}>
                    {linkable && r.key.startsWith("/") ? (
                      <Link to={r.href ?? r.key} target="_blank" className="inline-flex items-center gap-1 hover:text-primary">
                        {text}
                        <ExternalLinkIcon className="size-3 opacity-50" />
                      </Link>
                    ) : linkable && r.href ? (
                      <Link to={r.href} target="_blank" className="inline-flex items-center gap-1 hover:text-primary">
                        {text}
                        <ExternalLinkIcon className="size-3 opacity-50" />
                      </Link>
                    ) : (
                      text
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(r.pageviews)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(r.visitors)}</td>
                  <td className="py-1.5 pl-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <span className="block h-full rounded-full bg-primary/80" style={{ width: `${Math.max(1, share * 100)}%` }} />
                      </span>
                      <span className="w-11 text-right tabular-nums text-muted-foreground">{pct(share)}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.avgSec == null ? "—" : duration(r.avgSec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 30)} className="self-center text-xs text-muted-foreground hover:text-foreground">
          Показать ещё ({fmt(shown.length - limit)})
        </button>
      )}
    </div>
  );
}

/* -- Visitors ------------------------------------------------------------- */

const VISITOR_SORTS: Array<{ key: AdminVisitorsQuery["sort"]; label: string }> = [
  { key: "last", label: "Последний визит" },
  { key: "first", label: "Первый визит" },
  { key: "pageviews", label: "Просмотры" },
  { key: "sessions", label: "Визиты" },
  { key: "time", label: "Время" },
];

function VisitorsPanel({ filters }: { filters: Partial<AdminAnalyticsQuery> }) {
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput.trim(), 350);
  const [sort, setSort] = useState<AdminVisitorsQuery["sort"]>("last");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const { data, isFetching } = useAdminVisitors({ ...filters, ...(q ? { q } : {}), sort, dir, page, perPage: 30 });
  const pages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.perPage)) : 1;

  return (
    <Panel
      title="Посетители"
      description="Каждый браузер отдельно: откуда пришёл, сколько смотрел. Нажмите на строку — вся история переходов"
      icon={<UsersIcon />}
      action={data && <span className="text-xs text-muted-foreground">всего {fmt(data.meta.total)}</span>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              setPage(1);
            }}
            placeholder="Ник, почта или id посетителя"
            className="h-8 w-64 rounded-md border border-border/60 bg-background/60 pl-8 pr-2 text-xs outline-none focus:border-foreground/30"
          />
        </span>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as AdminVisitorsQuery["sort"]);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" className="w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISITOR_SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {dir === "desc" ? <ArrowDownIcon className="size-3.5" /> : <ArrowUpIcon className="size-3.5" />}
          {dir === "desc" ? "по убыванию" : "по возрастанию"}
        </button>
        {data && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                "посетители",
                ["id", "Пользователь", "Первый визит", "Последний", "Просмотры", "Визиты", "Время, с", "Устройство", "Браузер", "ОС", "Язык", "Источник"],
                data.items.map((v) => [v.visitorId, v.user?.displayName ?? "", v.firstSeen, v.lastSeen, v.pageviews, v.sessions, v.totalSec, v.device, v.browser, v.os, v.lang, v.source]),
              )
            }
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <DownloadIcon className="size-3.5" />
            CSV страницы
          </button>
        )}
      </div>

      {!data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.items.length === 0 ? (
        <EmptyBlock>Никого не нашлось</EmptyBlock>
      ) : (
        <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
          <table className="w-full min-w-[56rem] text-xs">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="py-2 font-medium">Кто</th>
                <th className="py-2 font-medium">Первый визит</th>
                <th className="py-2 font-medium">Последний</th>
                <th className="py-2 text-right font-medium">Просм.</th>
                <th className="py-2 text-right font-medium">Визиты</th>
                <th className="py-2 text-right font-medium">Время</th>
                <th className="py-2 pl-3 font-medium">Устройство</th>
                <th className="py-2 font-medium">Источник</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((v) => (
                <VisitorRow key={v.visitorId} v={v} onOpen={() => setOpened(v.visitorId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="grid size-8 place-items-center rounded-md border border-border/60 disabled:opacity-40"
            aria-label="Назад"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="tabular-nums text-muted-foreground">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="grid size-8 place-items-center rounded-md border border-border/60 disabled:opacity-40"
            aria-label="Далее"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}

      <VisitorSheet id={opened} onClose={() => setOpened(null)} />
    </Panel>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function VisitorRow({ v, onOpen }: { v: AdminVisitor; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border/40 hover:bg-foreground/[0.04]">
      <td className="py-1.5 pr-3">
        <span className="flex min-w-0 items-center gap-2">
          {v.user ? (
            <>
              <UserAvatar url={v.user.avatarUrl} name={v.user.displayName} className="size-6" />
              <span className="truncate font-medium">{v.user.displayName}</span>
            </>
          ) : (
            <>
              <span className="grid size-6 place-items-center rounded-full bg-foreground/10 text-[10px] text-muted-foreground">?</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">гость {v.visitorId.slice(0, 8)}</span>
            </>
          )}
          {v.isNew && <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">новый</span>}
        </span>
      </td>
      <td className="py-1.5 tabular-nums text-muted-foreground">{when(v.firstSeen)}</td>
      <td className="py-1.5 tabular-nums">{when(v.lastSeen)}</td>
      <td className="py-1.5 text-right tabular-nums">{fmt(v.pageviews)}</td>
      <td className="py-1.5 text-right tabular-nums">{fmt(v.sessions)}</td>
      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{v.totalSec ? duration(v.totalSec) : "—"}</td>
      <td className="py-1.5 pl-3 text-muted-foreground">
        {[v.device ? (DEVICE_RU[v.device] ?? v.device) : null, v.browser, v.os].filter(Boolean).join(" · ") || "—"}
      </td>
      <td className="max-w-[10rem] truncate py-1.5 text-muted-foreground">{v.source ?? "прямой заход"}</td>
    </tr>
  );
}

function VisitorSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending } = useAdminVisitor(id);
  // Grouped into visits: a new one after 30 quiet minutes, as everywhere else.
  const visits = useMemo(() => {
    if (!data) return [];
    const chronological = [...data.views].reverse();
    const out: Array<typeof chronological> = [];
    let last = 0;
    for (const view of chronological) {
      const at = Date.parse(view.at);
      if (out.length === 0 || at - last > 30 * 60_000) out.push([]);
      out[out.length - 1]!.push(view);
      last = at;
    }
    return out.reverse();
  }, [data]);

  return (
    <Sheet open={id != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <div className="flex flex-col gap-1 border-b border-border/60 p-5">
          <SheetTitle className="font-display">
            {data?.visitor.user ? data.visitor.user.displayName : `Гость ${id?.slice(0, 8) ?? ""}`}
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px]">{id}</SheetDescription>
          {data && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <Mini label="Просмотры" value={fmt(data.visitor.pageviews)} />
              <Mini label="Визиты" value={fmt(data.visitor.sessions)} />
              <Mini label="Время" value={data.visitor.totalSec ? duration(data.visitor.totalSec) : "—"} />
              <Mini label="Впервые" value={when(data.visitor.firstSeen)} />
              <Mini label="Последний раз" value={when(data.visitor.lastSeen)} />
              <Mini label="Источник" value={data.visitor.source ?? "прямой"} />
            </div>
          )}
          {data?.visitor.user?.username && (
            <Link to={`/profile/${data.visitor.user.username}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Профиль пользователя <ExternalLinkIcon className="size-3" />
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5">
          {isPending && <Skeleton className="h-64 rounded-xl" />}
          {visits.map((visit, i) => {
            const first = visit[0]!;
            const lastView = visit[visit.length - 1]!;
            return (
              <section key={`${first.at}-${i}`} className="flex flex-col gap-1.5">
                <h3 className="flex flex-wrap items-center gap-x-2 text-xs font-semibold">
                  {when(first.at)}
                  <span className="font-normal text-muted-foreground">
                    · {visit.length} стр. · {duration(Math.max(0, (Date.parse(lastView.at) - Date.parse(first.at)) / 1000 + (lastView.durationSec ?? 0)))}
                    {first.source ? ` · из ${first.source}` : ""}
                    {first.utm ? ` · ${first.utm}` : ""}
                    {first.device ? ` · ${DEVICE_RU[first.device] ?? first.device}${first.browser ? `, ${first.browser}` : ""}${first.screenW ? `, ${first.screenW}px` : ""}` : ""}
                  </span>
                </h3>
                <ol className="flex flex-col border-l border-border/60 pl-3">
                  {visit.map((view) => (
                    <li key={view.at + view.path} className="relative flex items-baseline gap-2 py-0.5 text-xs">
                      <span className="absolute -left-[15px] top-[9px] size-1.5 rounded-full bg-primary/70" />
                      <span className="w-11 shrink-0 tabular-nums text-muted-foreground">
                        {new Date(view.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Link to={view.path} target="_blank" className="min-w-0 truncate hover:text-primary">
                        {view.path}
                      </Link>
                      {view.durationSec != null && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{duration(view.durationSec)}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -- Archive (daily rollups) ------------------------------------------------ */

const ARCHIVE_DIMS: Array<{ key: string; label: string; views: string; uniques: string }> = [
  { key: "page", label: "Страницы", views: "Просмотры", uniques: "Посетители" },
  { key: "anime", label: "Тайтлы", views: "Просмотры", uniques: "Посетители" },
  { key: "watch", label: "Смотрели", views: "Минуты", uniques: "Сеансы" },
  { key: "referrer", label: "Источники", views: "Визиты", uniques: "Посетители" },
  { key: "device", label: "Устройства", views: "Просмотры", uniques: "Посетители" },
];

/**
 * Every month the daily rollups hold — they outlive the raw page views,
 * which are pruned after a few months. A month opens into its days and its
 * top pages, titles and sources, a request of its own.
 */
function ArchivePanel() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { data: months, isPending } = useAdminArchive(seen);
  const [open, setOpen] = useState<string | null>(null);
  const detail = useAdminArchiveMonth(open);
  const [dim, setDim] = useState(ARCHIVE_DIMS[0]!.key);
  const monthName = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <Panel title="Архив" description="Итоги по дням — хранятся дольше подробных данных" icon={<ArchiveIcon />}>
      <div ref={ref} />
      {!months ? (
        <Skeleton className={cn("h-40 rounded-xl", !isPending && "hidden")} />
      ) : months.length === 0 ? (
        <EmptyBlock>Итоги появятся после первого ночного подсчёта</EmptyBlock>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="py-1.5 font-medium">Месяц</th>
                  <th className="py-1.5 text-right font-medium">Просмотры</th>
                  <th className="py-1.5 text-right font-medium" title="Сумма по дням: вернувшийся в другой день считается снова">Посетители*</th>
                  <th className="py-1.5 text-right font-medium">Визиты</th>
                  <th className="py-1.5 text-right font-medium">Новые</th>
                  <th className="py-1.5 text-right font-medium">Регистрации</th>
                  <th className="py-1.5 text-right font-medium">Просмотр видео</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr
                    key={m.month}
                    onClick={() => setOpen((cur) => (cur === m.month ? null : m.month))}
                    className={cn(
                      "cursor-pointer border-t border-border/40 hover:bg-foreground/[0.03]",
                      open === m.month && "bg-primary/[0.06]",
                    )}
                  >
                    <td className="py-1.5 capitalize">{monthName(m.month)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.pageviews)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.visitors)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.sessions)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.newVisitors)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(m.registrations)}</td>
                    <td className="py-1.5 text-right tabular-nums">{duration(m.watchMinutes * 60)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {open && (
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium capitalize">{monthName(open)}</span>
                <Segmented value={dim} options={ARCHIVE_DIMS.map((d) => ({ key: d.key, label: d.label }))} onChange={setDim} />
              </div>
              {!detail.data ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : (
                <ArchiveTop dim={ARCHIVE_DIMS.find((d) => d.key === dim)!} rows={detail.data.top[dim] ?? []} />
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ArchiveTop({
  dim,
  rows,
}: {
  dim: (typeof ARCHIVE_DIMS)[number];
  rows: Array<{ key: string; label?: string; href?: string; views: number; uniques: number }>;
}) {
  if (rows.length === 0) return <EmptyBlock>За этот месяц здесь пусто</EmptyBlock>;
  const label = (key: string, text?: string) =>
    text ?? (dim.key === "referrer" ? key || "Прямые заходы" : dim.key === "device" ? (DEVICE_RU[key] ?? (key || "неизвестно")) : key);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[11px] text-muted-foreground">
          <th className="py-1 font-medium">{dim.label}</th>
          <th className="py-1 text-right font-medium">{dim.views}</th>
          <th className="py-1 text-right font-medium">{dim.uniques}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-border/40">
            <td className="max-w-[16rem] truncate py-1 pr-2 sm:max-w-[28rem]">
              {r.href ? (
                <Link to={r.href} target="_blank" className="hover:text-primary">
                  {label(r.key, r.label)}
                </Link>
              ) : (
                label(r.key, r.label)
              )}
            </td>
            <td className="py-1 text-right tabular-nums">{dim.key === "watch" ? fmt(Math.round(r.views / 60)) : fmt(r.views)}</td>
            <td className="py-1 text-right tabular-nums">{fmt(r.uniques)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-foreground/[0.04] px-2 py-1.5">
      <div className="truncate font-medium tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* -- Third-party ---------------------------------------------------------- */

function ExternalPanel() {
  const { data } = useAdminExternalAnalytics();
  if (!data) return null;
  const ym = data.yandex;
  const providers = [
    { name: "Яндекс Метрика", on: ym.counterId != null, id: ym.counterId, url: ym.dashboardUrl, env: "VITE_YM_ID (+ YM_OAUTH_TOKEN для сводки здесь)" },
    { name: "Google Analytics 4", on: data.google.measurementId != null, id: data.google.measurementId, url: data.google.dashboardUrl, env: "VITE_GA_ID" },
    { name: "Umami", on: data.umami.websiteId != null, id: data.umami.websiteId, url: data.umami.dashboardUrl, env: "VITE_UMAMI_SRC, VITE_UMAMI_ID, UMAMI_DASHBOARD_URL" },
  ];
  return (
    <Panel title="Сторонние метрики" description="Счётчики грузятся только после согласия посетителя на cookie" icon={<GlobeIcon />}>
      <div className="grid gap-2 md:grid-cols-3">
        {providers.map((p) => (
          <div key={p.name} className="flex flex-col gap-1 rounded-xl border border-border/60 p-3 text-xs">
            <span className="flex items-center gap-2 font-semibold">
              <span className={cn("size-2 rounded-full", p.on ? "bg-emerald-500" : "bg-foreground/20")} />
              {p.name}
              <span className="font-normal text-muted-foreground">{p.on ? "подключена" : "выключена"}</span>
            </span>
            {p.on ? (
              <span className="text-muted-foreground">
                id <span className="font-mono text-foreground">{p.id}</span>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                    открыть <ExternalLinkIcon className="size-3" />
                  </a>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Включить: <span className="font-mono text-foreground">{p.env}</span> в .env и деплой
              </span>
            )}
          </div>
        ))}
      </div>
      {ym.error && <p className="text-xs text-muted-foreground">Метрика: {ym.error}</p>}
      {ym.stats && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini label="Визиты (30 дн.)" value={fmt(ym.stats.visits)} />
            <Mini label="Посетители" value={fmt(ym.stats.users)} />
            <Mini label="Просмотры" value={fmt(ym.stats.pageviews)} />
            <Mini label="Отказы" value={pct(ym.stats.bounceRate)} />
            <Mini label="Ср. визит" value={duration(ym.stats.avgVisitSec)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SimpleList title="Источники трафика (Метрика)" rows={ym.stats.sources} />
            <SimpleList title="Поисковые фразы (Метрика)" rows={ym.stats.searchPhrases} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function SimpleList({ title, rows }: { title: string; rows: Array<{ name: string; visits: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold">{title}</span>
      {rows.length === 0 ? (
        <span className="text-xs text-muted-foreground">нет данных</span>
      ) : (
        rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2 text-xs">
            <span className="w-40 truncate">{r.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <span className="block h-full rounded-full bg-primary/80" style={{ width: `${(r.visits / max) * 100}%` }} />
            </span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">{fmt(r.visits)}</span>
          </div>
        ))
      )}
    </div>
  );
}
