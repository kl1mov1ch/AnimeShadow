import type { AdminDailyRow } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDaysIcon, FileTextIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyBlock, LiveDot, Panel } from "@/components/admin/admin-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU");
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} ч ${Math.round((s % 3600) / 60)} мин` : s >= 60 ? `${Math.round(s / 60)} мин` : `${s} с`);
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });

const COLUMNS: Array<{ key: keyof AdminDailyRow; label: string; hint: string; tone?: string }> = [
  { key: "visitors", label: "Уникальные", hint: "Разные люди (браузеры) за день — каждый один раз", tone: "text-foreground font-semibold" },
  { key: "newVisitors", label: "Новые", hint: "Впервые на сайте", tone: "text-emerald-400" },
  { key: "returning", label: "Вернулись", hint: "Уже бывали раньше", tone: "text-sky-400" },
  { key: "registeredVisitors", label: "Участники", hint: "Заходили, войдя в аккаунт" },
  { key: "guestVisitors", label: "Гости", hint: "Заходили без аккаунта" },
  { key: "pageviews", label: "Просмотры", hint: "Все открытия страниц" },
  { key: "repeatViews", label: "Повторы", hint: "Просмотры сверх первого у каждого посетителя — отдельной колонкой", tone: "text-amber-400" },
  { key: "sessions", label: "Визиты", hint: "Серии просмотров без перерыва больше 30 минут" },
  { key: "bounces", label: "Отказы", hint: "Визиты из одной страницы" },
  { key: "avgSessionSec", label: "Ср. визит", hint: "Средняя длина визита" },
  { key: "registrations", label: "Регистрации", hint: "Новые аккаунты" },
  { key: "watchMinutes", label: "Просмотр, мин", hint: "Сколько минут аниме посмотрели" },
];

/**
 * Attendance by day, every number apart: unique people (new and returning,
 * members and guests) next to all page views, with the repeat views in a
 * column of their own. Today counts live (refreshed every few minutes);
 * past days come from the nightly rollups, so a year of it costs nothing.
 */
export function DailyAttendancePanel() {
  const [days, setDays] = useState(30);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "daily", days],
    queryFn: ({ signal }) => apiRequest<{ items: AdminDailyRow[] }>("/admin/analytics/daily", { signal, query: { days } }).then((r) => r.items),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const rows = data ?? [];
  const total = rows.reduce(
    (t, r) => {
      for (const c of COLUMNS) if (c.key !== "avgSessionSec") (t as Record<string, number>)[c.key] = ((t as Record<string, number>)[c.key] ?? 0) + (r[c.key] as number);
      return t;
    },
    {} as Record<string, number>,
  );

  return (
    <Panel
      title="Посещаемость по дням"
      description="Уникальные люди отдельно, повторные просмотры — в своей колонке. Сегодня считается вживую."
      icon={<CalendarDaysIcon />}
      action={
        <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5 text-[11px] font-semibold">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn("rounded-md px-2.5 py-1", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {d === 365 ? "Год" : `${d} дн.`}
            </button>
          ))}
        </div>
      }
    >
      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyBlock>За этот период данных нет</EmptyBlock>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border/50">
          <table className="w-full min-w-[60rem] text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">День</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.hint} className="cursor-help px-2 py-2 text-right font-medium underline decoration-dotted decoration-foreground/20 underline-offset-4">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day} className={cn("border-b border-border/30 last:border-0 hover:bg-foreground/[0.03]", r.live && "bg-primary/[0.06]")}>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {r.live && <LiveDot />}
                      {dayLabel(r.day)}
                    </span>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={cn("px-2 py-1.5 text-right tabular-nums text-foreground/80", c.tone)}>
                      {c.key === "avgSessionSec" ? dur(r.avgSessionSec) : fmt(r[c.key] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t border-border/60 font-semibold">
                <td className="px-3 py-2">Сумма*</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-right tabular-nums">
                    {c.key === "avgSessionSec" ? "—" : fmt(total[c.key] ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        * В сумме по дням человек, заходивший в разные дни, считается каждый день. Повторы = просмотры − уникальные.
      </p>
    </Panel>
  );
}

interface DigestHour {
  hour: string;
  requests: number;
  status: Record<string, number>;
  avgMs: number;
  routes: Array<{ route: string; count: number; avgMs: number; maxMs: number; errors: number }>;
  errors: Array<{ message: string; count: number; route: string }>;
}

/**
 * The server's log, gathered by the hour: requests, statuses, the busiest
 * and slowest routes and the errors that came up — one line per hour in a
 * file per day, old files deleted on their own (and here, by hand).
 */
export function ServerLogPanel() {
  const client = useQueryClient();
  const [hours, setHours] = useState(24);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "logs", hours],
    queryFn: ({ signal }) =>
      apiRequest<{ hours: DigestHour[]; files: Array<{ name: string; day: string; bytes: number }>; keepDays: number }>("/admin/logs", {
        signal,
        query: { hours },
      }),
    refetchInterval: 60_000,
  });
  const prune = useMutation({
    mutationFn: () => apiRequest<{ removed: number }>("/admin/logs/prune", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.removed ? `Удалено старых файлов: ${r.removed}` : "Старых файлов нет");
      void client.invalidateQueries({ queryKey: ["admin", "logs"] });
    },
  });
  const list = data?.hours ?? [];
  const sum = list.reduce(
    (t, h) => ({ requests: t.requests + h.requests, errors: t.errors + (h.status["5xx"] ?? 0), client: t.client + (h.status["4xx"] ?? 0) }),
    { requests: 0, errors: 0, client: 0 },
  );
  // Routes and errors over the whole window.
  const routes = new Map<string, { count: number; totalMs: number; maxMs: number; errors: number }>();
  const errors = new Map<string, { count: number; route: string }>();
  for (const h of list) {
    for (const r of h.routes) {
      const cur = routes.get(r.route) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
      cur.count += r.count;
      cur.totalMs += r.avgMs * r.count;
      cur.maxMs = Math.max(cur.maxMs, r.maxMs);
      cur.errors += r.errors;
      routes.set(r.route, cur);
    }
    for (const e of h.errors) {
      const cur = errors.get(e.message) ?? { count: 0, route: e.route };
      cur.count += e.count;
      errors.set(e.message, cur);
    }
  }
  const busiest = [...routes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const slowest = [...routes.entries()].sort((a, b) => b[1].totalMs / b[1].count - a[1].totalMs / a[1].count).slice(0, 8);
  const topErrors = [...errors.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const bytes = (data?.files ?? []).reduce((n, f) => n + f.bytes, 0);

  return (
    <Panel
      title="Журнал сервера"
      description={`Сводка по часам вместо строки на каждый запрос. Файлы старше ${data?.keepDays ?? 30} дн. удаляются сами.`}
      icon={<ScrollTextIcon />}
      action={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5 text-[11px] font-semibold">
            {[6, 24, 72, 168].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={cn("rounded-md px-2.5 py-1", hours === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {h < 24 ? `${h} ч` : `${h / 24} дн.`}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={prune.isPending}
            onClick={() => prune.mutate()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Trash2Icon className="size-3.5" />
            Удалить старые
          </button>
        </div>
      }
    >
      {isPending ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Запросов", value: fmt(sum.requests) },
              { label: "Ошибок сервера (5xx)", value: fmt(sum.errors), tone: sum.errors ? "text-rose-400" : "" },
              { label: "Ошибок клиента (4xx)", value: fmt(sum.client), tone: "text-amber-400" },
              { label: `Файлов: ${data?.files.length ?? 0}`, value: `${(bytes / 1024).toFixed(1)} КБ` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border/50 bg-background/30 p-3">
                <p className={cn("font-display text-xl tabular-nums", k.tone)}>{k.value}</p>
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <RouteList title="Самые частые" rows={busiest.map(([r, v]) => [r, `${fmt(v.count)}`, v.errors ? `${v.errors} ош.` : ""])} />
            <RouteList title="Самые медленные (среднее / макс.)" rows={slowest.map(([r, v]) => [r, `${Math.round(v.totalMs / v.count)} мс`, `${v.maxMs} мс`])} />
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold">Ошибки</p>
              {topErrors.length === 0 ? (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">Ошибок за период нет</p>
              ) : (
                topErrors.map(([message, e]) => (
                  <div key={message} className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-1.5 text-[11px]">
                    <p className="line-clamp-2 font-medium text-rose-200">{message}</p>
                    <p className="text-muted-foreground">
                      {e.route} · {e.count} раз
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {data && data.files.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <FileTextIcon className="size-3.5" />
              {data.files.slice(0, 7).map((f) => (
                <span key={f.name} className="font-mono">
                  {f.name} · {(f.bytes / 1024).toFixed(1)} КБ
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function RouteList({ title, rows }: { title: string; rows: Array<[string, string, string]> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока нет данных</p>
      ) : (
        rows.map(([route, a, b]) => (
          <div key={route} className="flex items-center gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-1.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate font-mono">{route}</span>
            <span className="shrink-0 tabular-nums">{a}</span>
            {b && <span className="shrink-0 tabular-nums text-muted-foreground">{b}</span>}
          </div>
        ))
      )}
    </div>
  );
}

/** The secret achievements: their rules (shown only here) and how many have each. */
export function SecretAchievementsPanel() {
  const { data } = useQuery({
    queryKey: ["admin", "secret-achievements"],
    queryFn: ({ signal }) =>
      apiRequest<{ items: Array<{ id: string; condition: string; earnedBy: number }> }>("/admin/achievements/secret", { signal }).then((r) => r.items),
  });
  if (!data) return null;
  return (
    <Panel title="Секретные достижения" description="Условия видны только админам — пользователи знают лишь, что такие есть" icon={<ScrollTextIcon />}>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11px] text-violet-300">{r.id}</span>
              <span className="block text-xs leading-snug text-foreground/85">{r.condition}</span>
            </span>
            <span className="shrink-0 text-right text-[11px] text-muted-foreground">
              <b className="block text-sm tabular-nums text-foreground">{r.earnedBy}</b>
              получили
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

