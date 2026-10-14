import type { ScheduleItem, ScheduleWeek } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BellRingIcon,
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  PlayIcon,
  RadioIcon,
  StarIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHero } from "@/components/common/page-hero";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { hoverPrefetch } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

const TZ = "Europe/Moscow";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEK_LABEL: Record<number, string> = { [-1]: "Прошлая неделя", 0: "Эта неделя", 1: "Следующая неделя", 2: "Через неделю" };

/** Ticks every `ms` — for the countdowns. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "через 3 ч 12 мин", "через 2 дн 4 ч", "вышла 40 мин назад". */
function relative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const text = d > 0 ? `${d} дн ${h % 24} ч` : h > 0 ? `${h} ч ${m % 60} мин` : `${Math.max(1, m)} мин`;
  return diff > 0 ? `через ${text}` : `вышла ${text} назад`;
}

/**
 * The broadcast schedule: a week of episodes by day, Moscow time, from
 * AniList — the next one large with a live count down to the second, the
 * days as a strip with how many episodes each has, today's list split by a
 * "now" line into what's out and what's coming. A signed-in viewer can
 * keep only their own list.
 */
export function Component() {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const [week, setWeek] = useState(0);
  const [onlyMine, setOnlyMine] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ["schedule", week, authed],
    queryFn: ({ signal }) => apiRequest<ScheduleWeek>("/schedule", { signal, query: { week } }),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const now = useNow(30_000);
  const today = dayKey(new Date(now));

  const items = useMemo(() => (data?.items ?? []).filter((i) => !onlyMine || i.mine), [data, onlyMine]);
  const days = useMemo(() => {
    if (!data) return [];
    const start = Date.parse(data.from);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start + i * 86_400_000 + 12 * 3_600_000);
      const key = dayKey(date);
      return { key, date, label: WEEKDAYS[i]!, items: items.filter((it) => dayKey(new Date(it.airingAt)) === key) };
    });
  }, [data, items]);

  const [picked, setPicked] = useState<string | null>(null);
  // A new week opens on today, or its first day with episodes.
  useEffect(() => setPicked(null), [week]);
  const selected = picked ?? (days.find((d) => d.key === today)?.key ?? days.find((d) => d.items.length > 0)?.key ?? days[0]?.key ?? null);
  const day = days.find((d) => d.key === selected);

  const next = useMemo(() => {
    const upcoming = items.filter((i) => Date.parse(i.airingAt) > now);
    return upcoming.find((i) => i.mine) ?? upcoming[0] ?? null;
  }, [items, now]);
  const mineCount = (data?.items ?? []).filter((i) => i.mine).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHero
        icon={CalendarClockIcon}
        eyebrow="Онгоинги"
        title="Расписание выхода серий"
        lead="Когда серия выходит в Японии — по московскому времени. Озвучка обычно появляется через несколько часов или пару дней после этого."
      >
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BellRingIcon className="size-3.5 text-primary" />
          О новых сериях из вашего списка напомним в колокольчике, Telegram или push —{" "}
          <Link to="/profile?studio=notify" className="text-primary hover:underline">
            настроить
          </Link>
        </p>
      </PageHero>

      {next && week === 0 && <NextUp item={next} />}

      {/* The week and the filter. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-[var(--accent-line-soft)] bg-card/60 p-1">
          <button
            type="button"
            disabled={week <= -1}
            onClick={() => setWeek((w) => w - 1)}
            aria-label="Предыдущая неделя"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-36 px-2 text-center text-sm font-semibold">{WEEK_LABEL[week]}</span>
          <button
            type="button"
            disabled={week >= 2}
            onClick={() => setWeek((w) => w + 1)}
            aria-label="Следующая неделя"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground disabled:opacity-30"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        {authed && (
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            aria-pressed={onlyMine}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors",
              onlyMine ? "border-rose-400/50 bg-rose-500/15 text-rose-600 dark:text-rose-200" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
            )}
          >
            <HeartIcon className={cn("size-4", onlyMine && "fill-current")} />
            Только мой список
            <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums">{mineCount}</span>
          </button>
        )}
      </div>

      {/* The days. */}
      <div className="-mx-4 grid auto-cols-[minmax(4.25rem,1fr)] grid-flow-col gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {(isPending && !data ? Array.from({ length: 7 }, () => null) : days).map((d, i) =>
          d == null ? (
            <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
          ) : (
            <button
              key={d.key}
              type="button"
              onClick={() => setPicked(d.key)}
              aria-pressed={d.key === selected}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-2.5 transition-[background-color,border-color,transform] active:scale-95",
                d.key === selected
                  ? "border-primary/60 bg-gradient-to-b from-primary/25 to-primary/5 shadow-lg shadow-primary/15"
                  : "border-[var(--accent-line-soft)] bg-card/50 hover:border-foreground/25",
              )}
            >
              <span className={cn("text-[11px] font-semibold uppercase tracking-wide", d.key === today ? "text-primary" : "text-muted-foreground")}>
                {d.key === today ? "Сегодня" : d.label}
              </span>
              <span className="font-display text-xl leading-none">{d.date.getUTCDate()}</span>
              <span className={cn("text-[10.5px] tabular-nums", d.items.length ? "text-foreground/75" : "text-muted-foreground/50")}>
                {d.items.length ? `${d.items.length} ${plural(d.items.length, "серия", "серии", "серий")}` : "—"}
              </span>
              {d.items.some((x) => x.mine) && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-400" />}
            </button>
          ),
        )}
      </div>

      {/* The day. */}
      {isError ? (
        <p className="rounded-2xl border border-border/60 p-8 text-center text-sm text-muted-foreground">Не получилось загрузить расписание. Попробуйте обновить страницу.</p>
      ) : isPending && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : day && day.items.length > 0 ? (
        <DayList items={day.items} now={now} isToday={day.key === today} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--accent-line-soft)] px-6 py-12 text-center">
          <CalendarClockIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{onlyMine ? "Из вашего списка в этот день ничего не выходит" : "В этот день ничего не выходит"}</p>
          <p className="text-sm text-muted-foreground">Выберите другой день вверху.</p>
        </div>
      )}
    </div>
  );
}

/** The soonest episode (from one's own list first), with a count down to the second. */
function NextUp({ item }: { item: ScheduleItem }) {
  const now = useNow(1000);
  const at = Date.parse(item.airingAt);
  const left = Math.max(0, at - now);
  const parts = [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60];
  const name = item.anime.titleLocalized || item.anime.title;
  return (
    <Link
      to={animeHref(item.anime)}
      {...hoverPrefetch(animeHref(item.anime).slice("/anime/".length))}
      className="group relative isolate flex items-center gap-4 overflow-hidden rounded-3xl border border-primary/35 p-3 sm:gap-5 sm:p-4"
    >
      {item.anime.imageUrl && (
        <img src={imageSrc(item.anime.imageUrl)} alt="" aria-hidden className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-25 blur-2xl" />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(90%_140%_at_0%_0%,color-mix(in_srgb,var(--primary)_30%,transparent),transparent_60%),linear-gradient(90deg,var(--card),color-mix(in_srgb,var(--card)_70%,transparent))]" />
      <span className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/10 sm:w-24">
        {item.anime.imageUrl && <img src={imageSrc(item.anime.imageUrl)} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <RadioIcon className="size-3.5 animate-pulse" />
          {item.mine ? "Ближайшая из вашего списка" : "Ближайшая серия"}
        </span>
        <span className="line-clamp-2 font-display text-lg leading-tight sm:text-xl">{name}</span>
        <span className="text-xs text-muted-foreground">
          Серия {item.episode}
          {item.episodes ? ` из ${item.episodes}` : ""} · {new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(at))}, {clock(new Date(at))} МСК
        </span>
        <span className="mt-1 flex gap-1.5">
          {(["дн", "ч", "мин", "сек"] as const).map((unit, i) => (
            <span key={unit} className="flex min-w-12 flex-col items-center rounded-xl bg-black/30 px-2 py-1.5 ring-1 ring-white/10 sm:min-w-14">
              <span className="font-display text-lg leading-none tabular-nums sm:text-xl">{String(parts[i]).padStart(2, "0")}</span>
              <span className="text-[10px] text-muted-foreground">{unit}</span>
            </span>
          ))}
        </span>
      </span>
    </Link>
  );
}

/** One day's episodes by time; today, a "now" line between the aired and the coming. */
function DayList({ items, now, isToday }: { items: ScheduleItem[]; now: number; isToday: boolean }) {
  const nowRef = useRef<HTMLLIElement>(null);
  const splitAt = isToday ? items.findIndex((i) => Date.parse(i.airingAt) > now) : -1;
  const nextIndex = items.findIndex((i) => Date.parse(i.airingAt) > now);
  useEffect(() => {
    if (isToday && splitAt > 2) nowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday]);

  return (
    <ol className="relative flex flex-col gap-2 before:absolute before:bottom-3 before:left-[3.725rem] before:top-3 before:w-px before:bg-[var(--accent-line-soft)] sm:before:left-[4.225rem]">
      {items.map((item, i) => (
        <FragmentWithNow key={`${item.anime.id}-${item.episode}`} showNow={i === splitAt} nowRef={nowRef} now={now}>
          <Row item={item} now={now} next={i === nextIndex} />
        </FragmentWithNow>
      ))}
      {isToday && splitAt === -1 && <NowLine now={now} ref={nowRef} />}
    </ol>
  );
}

function FragmentWithNow({ showNow, nowRef, now, children }: { showNow: boolean; nowRef: React.Ref<HTMLLIElement>; now: number; children: React.ReactNode }) {
  return (
    <>
      {showNow && <NowLine now={now} ref={nowRef} />}
      {children}
    </>
  );
}

function NowLine({ now, ref }: { now: number; ref: React.Ref<HTMLLIElement> }) {
  return (
    <li ref={ref} className="relative flex items-center gap-3 py-1" aria-label="Сейчас">
      <span className="w-[2.6rem] text-right text-[11px] font-bold tabular-nums text-primary sm:w-[3.1rem]">{clock(new Date(now))}</span>
      <span className="relative z-10 size-3 shrink-0 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
      <span className="h-px flex-1 bg-gradient-to-r from-primary to-transparent" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Сейчас</span>
    </li>
  );
}

function Row({ item, now, next }: { item: ScheduleItem; now: number; next: boolean }) {
  const at = Date.parse(item.airingAt);
  const aired = at <= now;
  const name = item.anime.titleLocalized || item.anime.title;
  const href = animeHref(item.anime);
  const last = item.episodes != null && item.episode >= item.episodes;
  return (
    <li className="relative flex items-stretch gap-3">
      <span className={cn("w-[2.6rem] shrink-0 pt-3 text-right font-display text-sm tabular-nums sm:w-[3.1rem] sm:text-base", aired ? "text-muted-foreground" : "text-foreground")}>
        {clock(new Date(at))}
      </span>
      <span
        className={cn(
          "relative z-10 mt-4 size-3 shrink-0 rounded-full ring-4 ring-background",
          aired ? "bg-muted-foreground/40" : next ? "bg-primary shadow-[0_0_10px_var(--primary)]" : "bg-foreground/60",
        )}
      />
      <Link
        to={aired ? `${href}?ep=${item.episode}#watch` : href}
        {...hoverPrefetch(href.slice("/anime/".length))}
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-2 pr-3 transition-[border-color,background-color,transform] hover:-translate-y-0.5",
          next ? "border-primary/45 bg-primary/[0.08]" : item.mine ? "border-rose-400/30 bg-rose-500/[0.05]" : "border-[var(--accent-line-soft)] bg-card/50 hover:border-foreground/25",
          aired && !item.mine && "opacity-80",
        )}
      >
        <span className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-14">
          {item.anime.imageUrl && <img src={imageSrc(item.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{name}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={cn("rounded-md px-1.5 py-0.5 font-bold tabular-nums", last ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-foreground/[0.08]")}>
              {last ? "Финал · " : ""}Серия {item.episode}
              {item.episodes ? ` / ${item.episodes}` : ""}
            </span>
            {item.anime.score != null && item.anime.score > 0 && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                {item.anime.score.toFixed(1)}
              </span>
            )}
            {item.mine && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-600 dark:text-rose-300">
                <HeartIcon className="size-3 fill-current" />В списке
              </span>
            )}
          </span>
          <span className={cn("text-[11px] font-medium", aired ? "text-muted-foreground" : next ? "text-primary" : "text-foreground/70")}>{relative(at, now)}</span>
        </span>
        {aired && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground sm:inline-flex">
            <PlayIcon className="size-3 fill-current" />
            Смотреть
          </span>
        )}
      </Link>
    </li>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
