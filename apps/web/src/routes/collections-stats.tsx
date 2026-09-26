import { BarChart3Icon, EyeIcon, LockIcon, MessageSquareIcon, PlusIcon, StarIcon } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { PageHero } from "@/components/common/page-hero";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { useCollectionStats, useMyCollectionsStats } from "@/lib/query";
import { cn } from "@/lib/utils";

const VIEWS = "var(--chart-1)";
const COMMENTS = "var(--chart-2)";

/**
 * The author's own numbers: every collection's reads, ratings and comments
 * at a glance, the last thirty days of views across all of them, and —
 * for the one picked — its daily views and comments and how its ratings
 * split from one star to five.
 */
export function Component() {
  const t = useT();
  const { status } = useAuth();
  const [params, setParams] = useSearchParams();
  const open = params.get("open");
  const { data, isPending } = useMyCollectionsStats(status === "authenticated");

  if (status === "loading") return <Skeleton className="mx-auto mt-6 h-96 max-w-6xl rounded-2xl" />;
  if (status !== "authenticated") return <Navigate to="/login" replace />;

  const selected = open ?? data?.collections[0]?.id ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-4 sm:py-6">
      <PageHero icon={BarChart3Icon} eyebrow={t("collections.eyebrow")} title={t("collections.statsTitle")} lead={t("collections.statsLead")}>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/collections/new"
            className="btn-sheen inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30"
          >
            <PlusIcon className="size-4" />
            {t("collections.create")}
          </Link>
          {data?.limit && (
            <span className="self-center text-xs text-muted-foreground">
              {data.limit.max == null
                ? t("collections.limitPro", { n: data.limit.used })
                : t("collections.limitFree", { n: data.limit.used, max: data.limit.max })}
            </span>
          )}
        </div>
      </PageHero>

      {isPending || !data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : data.collections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary/30 p-10 text-center text-sm text-muted-foreground">
          {t("collections.statsEmpty")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={EyeIcon} label={t("collections.statViews")} value={String(data.totals.views)} />
            <Tile icon={StarIcon} label={t("collections.statRating")} value={data.totals.ratingAvg != null ? data.totals.ratingAvg.toFixed(1) : "—"} />
            <Tile icon={StarIcon} label={t("collections.statRatings")} value={String(data.totals.ratings)} />
            <Tile icon={MessageSquareIcon} label={t("collections.statComments")} value={String(data.totals.comments)} />
          </div>

          <Panel title={t("collections.statDaily")}>
            <ViewsChart data={data.daily.map((d) => ({ date: d.date, views: d.views }))} />
          </Panel>

          <Panel title={t("collections.statTable")}>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1">{t("collections.colTitle")}</th>
                    <th className="px-2 py-1">{t("collections.statViews")}</th>
                    <th className="px-2 py-1">{t("collections.col7d")}</th>
                    <th className="px-2 py-1">{t("collections.statRating")}</th>
                    <th className="px-2 py-1">{t("collections.statComments")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.collections.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setParams({ open: c.id }, { replace: true })}
                      className={cn(
                        "cursor-pointer transition-colors",
                        selected === c.id ? "bg-primary/15" : "bg-card/50 hover:bg-primary/[0.06]",
                      )}
                    >
                      <td className="rounded-l-lg px-2 py-2">
                        <span className="flex items-center gap-1.5 font-medium">
                          {!c.published && <LockIcon className="size-3.5 text-muted-foreground" />}
                          <Link to={`/collections/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
                            {c.title}
                          </Link>
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{c.views}</td>
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">+{c.views7d}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {c.ratingAvg != null ? `${c.ratingAvg.toFixed(1)} (${c.ratingCount})` : "—"}
                      </td>
                      <td className="rounded-r-lg px-2 py-2 tabular-nums">{c.comments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {selected && <OneCollection id={selected} />}
        </>
      )}
    </div>
  );
}

function OneCollection({ id }: { id: string }) {
  const t = useT();
  const { data, isPending } = useCollectionStats(id);
  if (isPending || !data) return <Skeleton className="h-72 rounded-2xl" />;
  const maxRating = Math.max(1, ...data.ratings);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Panel title={t("collections.statOne", { title: data.title })}>
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            {t("collections.statViews")}: <b className="text-foreground">{data.totals.views}</b>
          </span>
          <span>
            {t("collections.statUnique")}: <b className="text-foreground">{data.totals.uniqueVisitors30d}</b>
          </span>
          <span>
            {t("collections.statComments")}: <b className="text-foreground">{data.totals.comments}</b>
          </span>
        </div>
        <ViewsChart data={data.daily} withComments />
      </Panel>
      <Panel title={t("collections.statDistribution")}>
        <div className="flex flex-col gap-2">
          {[5, 4, 3, 2, 1].map((v) => {
            const n = data.ratings[v - 1] ?? 0;
            return (
              <div key={v} className="flex items-center gap-2 text-xs">
                <span className="flex w-8 items-center gap-0.5 font-semibold tabular-nums">
                  {v}
                  <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-primary/10">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(n / maxRating) * 100}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span>
              </div>
            );
          })}
          <p className="pt-1 text-xs text-muted-foreground">
            {data.totals.ratingAvg != null
              ? t("collections.ratingLine", { avg: data.totals.ratingAvg.toFixed(1), n: data.totals.ratingCount })
              : t("collections.noRatings")}
          </p>
        </div>
      </Panel>
    </div>
  );
}

function ViewsChart({ data, withComments = false }: { data: Array<{ date: string; views: number; comments?: number }>; withComments?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const config = {
    views: { label: t("collections.statViews"), color: VIEWS },
    comments: { label: t("collections.statComments"), color: COMMENTS },
  } satisfies ChartConfig;
  if (data.every((d) => d.views === 0 && !d.comments)) {
    return <p className="grid h-40 place-items-center text-sm text-muted-foreground">{t("collections.statNoData")}</p>;
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-52 w-full">
      {withComments ? (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.3} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => day.format(new Date(v))} />
          <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => day.format(new Date(String(v)))} />} />
          <Bar dataKey="views" fill={VIEWS} radius={[4, 4, 0, 0]} />
          <Bar dataKey="comments" fill={COMMENTS} radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.3} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => day.format(new Date(v))} />
          <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => day.format(new Date(String(v)))} />} />
          <Area dataKey="views" type="monotone" stroke={VIEWS} fill={VIEWS} fillOpacity={0.25} strokeWidth={2} />
        </AreaChart>
      )}
    </ChartContainer>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof EyeIcon; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <h2 className="font-display text-base">{title}</h2>
      {children}
    </section>
  );
}
