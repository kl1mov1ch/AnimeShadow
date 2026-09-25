import {
  ADMIN_MONITORING_RANGES,
  type AdminMonitoring,
  type AdminMonitoringPanel,
  type AdminMonitoringRange,
} from "@animeshadow/shared";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CpuIcon,
  EyeIcon,
  GaugeIcon,
  type LucideIcon,
  MemoryStickIcon,
  TimerIcon,
  UserPlusIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
import { useAdminMonitoring } from "@/lib/query";
import { cn } from "@/lib/utils";
import { EmptyBlock, ENTER, LiveDot, Panel, timeAgo } from "./admin-ui";

type Unit = "rps" | "ms" | "count" | "minutes" | "bytes" | "percent";

const PANEL_META: Record<AdminMonitoringPanel, { icon: LucideIcon; unit: Unit }> = {
  requests: { icon: ZapIcon, unit: "rps" },
  latency: { icon: TimerIcon, unit: "ms" },
  errors: { icon: AlertTriangleIcon, unit: "rps" },
  pageviews: { icon: EyeIcon, unit: "count" },
  watch: { icon: ActivityIcon, unit: "minutes" },
  active: { icon: UsersIcon, unit: "count" },
  signups: { icon: UserPlusIcon, unit: "count" },
  memory: { icon: MemoryStickIcon, unit: "bytes" },
  cpu: { icon: CpuIcon, unit: "percent" },
};

/** Each series gets a fixed colour by its meaning, never by its position —
 *  "guests" is the same blue on every panel. */
const SERIES_COLOR: Record<string, string> = {
  registered: "var(--chart-1)",
  guest: "var(--chart-2)",
  total: "var(--chart-1)",
  p50: "var(--chart-2)",
  p95: "var(--chart-1)",
  "5xx": "var(--chart-1)",
  "4xx": "var(--chart-3)",
  registrations: "var(--chart-1)",
  logins: "var(--chart-2)",
  rss: "var(--chart-1)",
  heap: "var(--chart-2)",
  cpu: "var(--chart-1)",
};

/**
 * Live curves from Prometheus. The browser only ever picks a range; the API
 * turns that into a fixed set of queries against Prometheus (PROMETHEUS_URL)
 * and hands back the series. Everything counted in two audiences —
 * pageviews, watch time, active visitors — is drawn as registered vs guests.
 */
export function AdminMonitoringTab() {
  const t = useT();
  const { locale } = useLocale();
  const [range, setRange] = useState<AdminMonitoringRange>("24h");
  const { data, isPending, isError, refetch, isFetching } = useAdminMonitoring(range);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          ENTER,
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] px-4 py-3",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
            <GaugeIcon className="size-3.5" />
            Prometheus
          </span>
          {data.available ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  data.targetUp === false
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {data.targetUp === false ? <AlertTriangleIcon className="size-3" /> : <LiveDot />}
                {data.targetUp === false
                  ? t("admin.x.mon.targetDown")
                  : data.targetUp == null
                    ? t("admin.x.mon.targetMissing")
                    : t("admin.x.mon.targetUp")}
              </span>
              {data.lastScrape && (
                <span className="text-muted-foreground">
                  {t("admin.x.mon.lastScrape", { ago: timeAgo(data.lastScrape, locale) })}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-rose-500">
              <AlertTriangleIcon className="size-3" />
              {t("admin.x.mon.unreachable")}
            </span>
          )}
        </div>
        <div className={cn("flex rounded-lg border border-primary/25 bg-primary/5 p-0.5", isFetching && "opacity-70")}>
          {ADMIN_MONITORING_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold tabular-nums transition-colors",
                range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!data.available ? (
        <Panel icon={<AlertTriangleIcon />} title={t("admin.x.mon.setupTitle")} description={data.error ?? undefined}>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>{t("admin.x.mon.step1")}</li>
            <li>
              <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs text-foreground">
                sh deploy/prometheus/write-token.sh && docker compose up -d prometheus
              </code>
            </li>
            <li>{t("admin.x.mon.step3")}</li>
          </ol>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {data.panels.map((panel, i) => (
            <MetricPanel key={panel.id} panel={panel} range={range} delay={i * 40} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricPanel({
  panel,
  range,
  delay,
}: {
  panel: AdminMonitoring["panels"][number];
  range: AdminMonitoringRange;
  delay: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const meta = PANEL_META[panel.id];
  const Icon = meta.icon;

  // One row per timestamp, one column per series.
  const rows = new Map<number, Record<string, number>>();
  for (const s of panel.series) {
    for (const [ts, v] of s.points) {
      const row = rows.get(ts) ?? { ts };
      row[s.key] = meta.unit === "ms" ? v * 1000 : v;
      rows.set(ts, row);
    }
  }
  const data = [...rows.values()].sort((a, b) => a.ts! - b.ts!);
  const keys = panel.series.map((s) => s.key);
  const config = Object.fromEntries(
    keys.map((key) => [
      key,
      { label: t(`admin.x.mon.series.${key}` as "admin.x.mon.series.total"), color: SERIES_COLOR[key] ?? "var(--chart-5)" },
    ]),
  ) satisfies ChartConfig;

  const time = new Intl.DateTimeFormat(
    locale,
    range === "7d" ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" },
  );
  const format = (v: number) => formatValue(v, meta.unit);
  const latest = keys.map((key) => {
    const last = [...data].reverse().find((row) => row[key] != null);
    return { key, value: last?.[key] ?? null };
  });

  return (
    <Panel
      icon={<Icon />}
      title={t(`admin.x.mon.panels.${panel.id}` as "admin.x.mon.panels.requests")}
      description={t(`admin.x.mon.units.${meta.unit}` as "admin.x.mon.units.rps")}
      delay={delay}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          {latest.map(({ key, value }) =>
            value == null ? null : (
              <span key={key} className="flex items-center gap-1 text-xs tabular-nums">
                <span className="size-2 rounded-full" style={{ background: SERIES_COLOR[key] ?? "var(--chart-5)" }} />
                <span className="font-semibold">{format(value)}</span>
              </span>
            ),
          )}
        </div>
      }
    >
      {data.length < 2 ? (
        <EmptyBlock>{t("admin.x.mon.noData")}</EmptyBlock>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-48 w-full">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickFormatter={(v: number) => time.format(new Date(v * 1000))}
            />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={format} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString(locale)}
                  valueFormatter={(v) => format(v)}
                />
              }
            />
            {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {keys.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={SERIES_COLOR[key] ?? "var(--chart-5)"}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

function formatValue(v: number, unit: Unit): string {
  switch (unit) {
    case "rps":
      return v >= 10 ? v.toFixed(0) : v.toFixed(2);
    case "ms":
      return `${Math.round(v)}`;
    case "bytes":
      return v >= 1024 ** 3 ? `${(v / 1024 ** 3).toFixed(1)}G` : `${Math.round(v / 1024 ** 2)}M`;
    case "percent":
      return `${v.toFixed(1)}%`;
    case "minutes":
      return v >= 100 ? v.toFixed(0) : v.toFixed(1);
    default:
      return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  }
}
