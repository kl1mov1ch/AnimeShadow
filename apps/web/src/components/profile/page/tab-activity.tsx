import type { FeedEvent, PublicProfile } from "@animeshadow/shared";
import { ActivityIcon, CalendarDaysIcon, FlameIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useUserFeed, useUserYear } from "@/lib/query";
import { cn } from "@/lib/utils";
import { dayHeading, plural } from "./format";
import { EmptyNote, LockedNote, Panel, Pills } from "./kit";
import { FeedRow } from "./tab-overview";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/**
 * Activity: the year as a grid of days (a column per week, brighter for
 * more episodes) with the year's numbers beside it, the last two weeks as
 * bars, and everything they did, day by day, with a filter by kind.
 */
export function ActivityTab({ profile }: { profile: PublicProfile }) {
  if (profile.hidden.activity) return <LockedNote what="Раздел активности" />;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-stretch gap-5 lg:grid-cols-12 [&>*]:h-full">
        <div className="min-w-0 lg:col-span-8">
          <YearPanel profile={profile} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <RhythmPanel profile={profile} />
        </div>
      </div>
      <FeedPanel profile={profile} />
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
  const months = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0);
    for (const day of data?.days ?? []) {
      const key = day.day.slice(0, 10);
      if (Number(key.slice(0, 4)) !== year) continue;
      const month = Number(key.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) totals[month]! += day.episodes;
    }
    return totals;
  }, [data, year]);
  const maximum = Math.max(1, ...months);

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
      className="h-full"
      title={`${year} в аниме`}
      icon={CalendarDaysIcon}
      action={
        years.length > 1 ? (
          <Pills value={String(year)} onPick={(v) => setYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div aria-label={`Просмотренные серии по месяцам за ${year} год`} className={cn("grid grid-cols-6 gap-x-3 gap-y-4 sm:grid-cols-12 sm:gap-2", isPending && "opacity-40")}>
          {months.map((total, month) => <div key={month} className="flex min-w-0 flex-col gap-1.5 text-center" title={`${MONTHS[month]}: ${total} серий`}>
            <span className="text-[11px] font-semibold tabular-nums">{total || "—"}</span>
            <span className="flex h-16 items-end rounded-md bg-secondary/50 sm:h-24"><span className={cn("block w-full rounded-md", total ? "bg-primary/80" : "bg-border")} style={{ height: total ? `${Math.max(8, total / maximum * 100)}%` : 3 }} /></span>
            <span className="text-[10px] text-muted-foreground">{MONTHS[month]}</span>
          </div>)}
        </div>
        {!isPending && months.every(n => n === 0) && <p className="text-xs text-muted-foreground">Начните смотреть — здесь появится история по месяцам.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {isPending
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-foreground/[0.05]" />)
            : tiles.map((tile) => (
                <div key={tile.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-secondary/50 px-3 py-2">
                  <span className="font-display text-xl tabular-nums">{tile.value}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{tile.label}</span>
                </div>
              ))}
          {data?.topGenre && (
            <div className="col-span-2 rounded-2xl bg-primary/10 px-3 py-2 text-xs sm:col-span-1">
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
    <Panel title="Две недели" icon={FlameIcon} className="h-full">
      <div className="flex h-32 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${new Date(d.day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}: ${d.episodes} ${plural(d.episodes, "серия", "серии", "серий")}, ${d.minutes} мин`}>
            <span
              className={cn("w-full rounded-md", d.episodes > 0 ? "bg-primary" : "bg-foreground/[0.08]")}
              style={{ height: Math.max(6, (d.episodes / max) * 104) }}
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
