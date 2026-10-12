import type { FeedEvent, PublicProfile } from "@animeshadow/shared";
import { ActivityIcon, CalendarDaysIcon, FlameIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useUserFeed, useUserYear } from "@/lib/query";
import { cn } from "@/lib/utils";
import { dayHeading, plural } from "./format";
import { EmptyNote, LockedNote, Panel, Pills } from "./kit";
import { FeedRow } from "./tab-overview";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function heat(n: number): string {
  if (n === 0) return "bg-foreground/[0.06]";
  if (n === 1) return "bg-primary/30";
  if (n <= 3) return "bg-primary/55";
  if (n <= 6) return "bg-primary/80";
  return "bg-primary";
}

/**
 * Activity: the year as a grid of days (a column per week, brighter for
 * more episodes) with the year's numbers beside it, the last two weeks as
 * bars, and everything they did, day by day, with a filter by kind.
 */
export function ActivityTab({ profile }: { profile: PublicProfile }) {
  if (profile.hidden.activity) return <LockedNote what="Раздел активности" />;
  return (
    <div className="flex flex-col gap-5">
      <YearPanel profile={profile} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <FeedPanel profile={profile} />
        <RhythmPanel profile={profile} />
      </div>
    </div>
  );
}

function YearPanel({ profile }: { profile: PublicProfile }) {
  const labels = useLabels();
  const thisYear = new Date().getFullYear();
  const joined = new Date(profile.memberSince).getFullYear();
  const years = Array.from({ length: Math.max(1, Math.min(4, thisYear - joined + 1)) }, (_, i) => thisYear - i);
  const [year, setYear] = useState(thisYear);
  const { data, isPending } = useUserYear(profile.id, year);
  const scroller = useRef<HTMLDivElement>(null);

  // Weeks from the Monday on or before 1 January, a column each.
  const weeks = useMemo(() => {
    const byDay = new Map((data?.days ?? []).map((d) => [d.day.slice(0, 10), d.episodes]));
    const start = new Date(year, 0, 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(year, 11, 31);
    const out: Array<Array<{ key: string; n: number; inYear: boolean; future: boolean; today: boolean }>> = [];
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    for (let d = new Date(start); d <= end; ) {
      const week = [];
      for (let i = 0; i < 7; i += 1) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        week.push({ key, n: byDay.get(key) ?? 0, inYear: d.getFullYear() === year, future: d > today, today: key === todayKey });
        d.setDate(d.getDate() + 1);
      }
      out.push(week);
    }
    return out;
  }, [data, year]);

  // On a phone the grid scrolls; start it with today near the right edge.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const mark = el.querySelector<HTMLElement>("[data-today]");
    el.scrollLeft = year === thisYear && mark ? mark.offsetLeft - el.clientWidth + 48 : el.scrollWidth;
  }, [weeks, year, thisYear]);

  const tiles = data
    ? [
        { value: data.episodes, label: plural(data.episodes, "серия", "серии", "серий") },
        { value: Math.round(data.hours), label: plural(Math.round(data.hours), "час", "часа", "часов") },
        { value: data.titlesCompleted, label: "досмотрено" },
        { value: data.activeDays, label: plural(data.activeDays, "день", "дня", "дней") + " с аниме" },
        { value: data.longestStreak, label: `${plural(data.longestStreak, "день", "дня", "дней")} подряд` },
      ]
    : [];

  return (
    <Panel
      title={`${year} в аниме`}
      icon={CalendarDaysIcon}
      action={
        years.length > 1 ? (
          <Pills value={String(year)} onPick={(v) => setYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        ) : undefined
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div ref={scroller} className="relative overflow-x-auto pb-1 [scrollbar-width:thin]">
            <div className="inline-flex flex-col gap-1">
              <div className="flex gap-[3px] pl-0 text-[10px] text-muted-foreground">
                {weeks.map((week, i) => {
                  const first = week.find((d) => d.inYear && d.key.endsWith("-01"));
                  return (
                    <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap sm:w-[13px]">
                      {first ? MONTHS[Number(first.key.slice(5, 7)) - 1] : ""}
                    </span>
                  );
                })}
              </div>
              <div className={cn("flex gap-[3px] transition-opacity", isPending && "opacity-40")}>
                {weeks.map((week, i) => (
                  <div key={i} className="flex flex-col gap-[3px]">
                    {week.map((day) => (
                      <span
                        key={day.key}
                        data-today={day.today || undefined}
                        title={day.inYear ? `${new Date(day.key).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: ${day.n} ${plural(day.n, "серия", "серии", "серий")}` : undefined}
                        className={cn(
                          "size-[11px] rounded-[3px] transition-colors sm:size-[13px]",
                          !day.inYear ? "bg-transparent" : day.future ? "bg-foreground/[0.025]" : heat(day.n),
                          day.today && "ring-1 ring-primary ring-offset-1 ring-offset-background",
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            меньше
            {[0, 1, 2, 4, 8].map((n) => (
              <span key={n} className={cn("size-[11px] rounded-[3px]", heat(n))} />
            ))}
            больше
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 xl:content-start">
          {isPending
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-foreground/[0.05]" />)
            : tiles.map((tile) => (
                <div key={tile.label} className="flex items-baseline gap-2 rounded-2xl bg-background/40 px-3 py-2">
                  <span className="font-display text-xl tabular-nums">{tile.value}</span>
                  <span className="truncate text-xs text-muted-foreground">{tile.label}</span>
                </div>
              ))}
          {data?.topGenre && (
            <div className="col-span-2 rounded-2xl bg-primary/10 px-3 py-2 text-xs xl:col-span-1">
              Главный жанр года: <span className="font-semibold text-primary">{labels.genreLabel(data.topGenre)}</span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function RhythmPanel({ profile }: { profile: PublicProfile }) {
  const days = profile.stats.dailyActivity;
  const max = Math.max(1, ...days.map((d) => d.episodes));
  const total = days.reduce((s, d) => s + d.episodes, 0);
  return (
    <Panel title="Две недели" icon={FlameIcon}>
      <div className="flex h-32 items-end gap-1.5">
        {days.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${new Date(d.day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}: ${d.episodes} ${plural(d.episodes, "серия", "серии", "серий")}, ${d.minutes} мин`}>
            <span
              className={cn("w-full rounded-md transition-[height] duration-700 ease-out", d.episodes > 0 ? "bg-primary" : "bg-foreground/[0.08]")}
              style={{ height: Math.max(6, (d.episodes / max) * 104), transitionDelay: `${i * 30}ms` }}
            />
            <span className="text-[9px] tabular-nums text-muted-foreground">{new Date(d.day).getDate()}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-2xl bg-background/40 px-3 py-2">
          <p className="font-display text-lg tabular-nums">{total}</p>
          <p className="text-muted-foreground">{plural(total, "серия", "серии", "серий")} за 14 дней</p>
        </div>
        <div className="rounded-2xl bg-background/40 px-3 py-2">
          <p className="font-display text-lg tabular-nums">{profile.stats.avgSessionMinutes != null ? `${Math.round(profile.stats.avgSessionMinutes)} мин` : "—"}</p>
          <p className="text-muted-foreground">средний сеанс</p>
        </div>
      </div>
    </Panel>
  );
}

type Kind = FeedEvent["kind"] | "all";

function FeedPanel({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const { data, isPending } = useUserFeed(profile.id);
  const [kind, setKind] = useState<Kind>("all");
  const [limit, setLimit] = useState(30);
  const items = (data ?? []).filter((e) => kind === "all" || e.kind === kind);
  const groups = useMemo(() => {
    const out: Array<{ day: string; events: FeedEvent[] }> = [];
    for (const e of items.slice(0, limit)) {
      const day = dayHeading(e.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.events.push(e);
      else out.push({ day, events: [e] });
    }
    return out;
  }, [items, limit]);

  const kinds: Kind[] = ["all", "episode", "completed", "rated", "added", "achievement"];
  return (
    <Panel title="Лента" icon={ActivityIcon}>
      <Pills
        value={kind}
        onPick={(k) => {
          setKind(k);
          setLimit(30);
        }}
        options={kinds.map((k) => ({
          value: k,
          label: t(`profile.feed.filter.${k}` as "profile.feed.filter.all"),
          count: k === "all" ? undefined : (data ?? []).filter((e) => e.kind === k).length,
        }))}
        className="mb-4"
      />
      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-foreground/[0.05]" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote icon={ActivityIcon} title="Здесь пока пусто" />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.day} className="relative pl-4">
              <span aria-hidden className="absolute bottom-1 left-0 top-1 w-px bg-[var(--accent-line-soft)]" />
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.day}</p>
              <ul className="flex flex-col gap-3">
                {group.events.map((event, i) => (
                  <FeedRow key={`${event.kind}-${event.at}-${i}`} event={event} index={i} />
                ))}
              </ul>
            </div>
          ))}
          {items.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 30)}
              className="mx-auto h-9 rounded-full border border-[var(--accent-line-soft)] px-5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              Показать ещё
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
