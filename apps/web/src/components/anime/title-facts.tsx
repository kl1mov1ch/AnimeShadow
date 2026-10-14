import type { AnimeDetail } from "@animeshadow/shared";
import {
  BuildingIcon,
  CalendarDaysIcon,
  ClockIcon,
  FilmIcon,
  HeartIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { TRACK_CARD, TRACK_HEAD } from "@/components/library/title-tracker";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useLibrary } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * Minutes per episode from the catalogue's free-text duration — "24 min per
 * ep", "1 hr 30 min", "24 мин.", "1 ч 45 мин" all occur.
 */
function minutesPerEpisode(duration: string | null): number | null {
  if (!duration) return null;
  const hours = /(\d+)\s*(?:hr|h|ч)/i.exec(duration);
  const minutes = /(\d+)\s*(?:min|m\b|мин)/i.exec(duration);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

/** Whether the title's running time is known — the watch-time card has something to say. */
export function hasWatchTime(anime: AnimeDetail): boolean {
  return minutesPerEpisode(anime.duration) != null && (anime.episodes ?? 0) > 0;
}

interface Fact {
  key: string;
  icon: ReactNode;
  text: string;
  accent?: boolean;
}

/** "11 ч 12 мин", "48 мин". */
function formatMinutes(total: number, t: ReturnType<typeof useT>): string {
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours > 0
    ? `${hours} ${t("detail.quickFacts.h")}${mins ? ` ${mins} ${t("detail.quickFacts.min")}` : ""}`
    : `${mins} ${t("detail.quickFacts.min")}`;
}

function useFacts(anime: AnimeDetail) {
  const t = useT();
  const labels = useLabels();
  const perEp = minutesPerEpisode(anime.duration);
  const episodes = anime.episodes ?? 0;
  const totalMinutes = perEp && episodes > 0 ? perEp * episodes : null;

  const facts: Fact[] = [];
  if (totalMinutes) {
    const time = formatMinutes(totalMinutes, t);
    facts.push({ key: "total", icon: <ClockIcon />, text: t("detail.quickFacts.totalTime", { time }), accent: true });
  }
  if (perEp && episodes > 1) {
    facts.push({ key: "eps", icon: <FilmIcon />, text: t("detail.quickFacts.perEpisode", { episodes, minutes: perEp }) });
  }
  if (anime.rank != null && anime.rank > 0) {
    facts.push({ key: "rank", icon: <TrophyIcon />, text: t("detail.quickFacts.rank", { rank: labels.plain(anime.rank) }) });
  }
  if (anime.members) {
    facts.push({ key: "members", icon: <UsersIcon />, text: t("detail.quickFacts.members", { count: labels.compact(anime.members) }) });
  }
  if (anime.favorites) {
    facts.push({ key: "fav", icon: <HeartIcon />, text: t("detail.quickFacts.favorites", { count: labels.compact(anime.favorites) }) });
  }
  if (anime.studios[0]) {
    facts.push({ key: "studio", icon: <BuildingIcon />, text: anime.studios.slice(0, 2).join(", ") });
  }
  return { facts, perEp, episodes, totalMinutes };
}

/** Episodes a day on offer: from one up to the whole show, at most 24. */
function paceLimit(episodes: number): number {
  return Math.max(1, Math.min(24, episodes));
}

/** Days of the week a marathon counts: every day, or Saturdays and Sundays only. */
function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/** The date of the n-th watching day from today (n ≥ 1), skipping weekdays if asked. */
function nthWatchDay(n: number, weekendsOnly: boolean): Date {
  const d = startOfDay(new Date());
  let left = n;
  for (let guard = 0; guard < 4000; guard++) {
    if (!weekendsOnly || isWeekend(d)) left -= 1;
    if (left <= 0) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Watching days from today to a date, inclusive. */
function watchDaysUntil(target: Date, weekendsOnly: boolean): number {
  const d = startOfDay(new Date());
  let n = 0;
  while (d.getTime() <= target.getTime() && n < 4000) {
    if (!weekendsOnly || isWeekend(d)) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, n);
}

const STEPPER =
  "grid size-8 place-items-center rounded-lg border border-border/70 bg-background/40 text-foreground/80 transition-colors hover:border-foreground/25 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-35";

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t("detail.quickFacts.fewer")} className={STEPPER}>
          <MinusIcon className="size-3.5" />
        </button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t("detail.quickFacts.more")} className={STEPPER}>
          <PlusIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * "How long to watch" on the title page — the whole calculator in the card,
 * no window to open: the running time; how much is left (from the list, or
 * set by hand); a pace or a date to finish by; every day or weekends only;
 * and the answer — when, how many days, how long a day — with a strip of the
 * days. It is for members: a guest sees the total and a locked preview.
 */
export function WatchTimeCard({ anime, className }: { anime: AnimeDetail; className?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data: entries } = useLibrary(undefined, authed);
  const listed = entries?.find((e) => e.anime.id === anime.id)?.progress ?? 0;
  const { perEp, episodes, totalMinutes } = useFacts(anime);
  const maxPerDay = paceLimit(episodes);
  const [perDay, setPerDay] = useState(Math.min(2, maxPerDay));
  const [watchedSet, setWatched] = useState<number | null>(null);
  const [mode, setMode] = useState<"perDay" | "byDate">("perDay");
  const [weekends, setWeekends] = useState(false);
  const [byDays, setByDays] = useState(7);
  if (!totalMinutes) return null;

  const series = episodes > 1;
  const target = startOfDay(new Date());
  target.setDate(target.getDate() + byDays - 1);
  const targetLabel = target.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const watched = Math.min(Math.max(0, watchedSet ?? listed), Math.max(0, episodes - 1));
  const left = Math.max(1, episodes - watched);
  const pace =
    mode === "byDate"
      ? Math.min(left, Math.max(1, Math.ceil(left / watchDaysUntil(target, weekends))))
      : Math.min(perDay, left);
  const days = Math.ceil(left / pace);
  const finishLabel = nthWatchDay(days, weekends).toLocaleDateString(locale, { day: "numeric", month: "long" });
  const leftMinutes = perEp ? perEp * left : totalMinutes;
  const dots = Math.min(days, 28);
  const tab = (on: boolean) =>
    cn(
      "h-7 flex-1 rounded-md px-2 text-[11px] font-semibold transition-colors",
      on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <section className={cn(TRACK_CARD, className)} aria-label={t("detail.quickFacts.cardTitle")}>
      <h3 className={TRACK_HEAD}>
        <ClockIcon />
        {t("detail.quickFacts.cardTitle")}
      </h3>

      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-display text-2xl tabular-nums leading-none">{formatMinutes(totalMinutes, t)}</span>
        <span className="text-xs text-muted-foreground">
          {series && perEp ? t("detail.quickFacts.perEpisode", { episodes, minutes: perEp }) : t("detail.quickFacts.film")}
        </span>
      </div>

      {series && status === "anonymous" && (
        <div className="relative min-h-32 flex-1 overflow-hidden rounded-xl border border-border/50">
          {/* What it would look like, blurred — and why to sign up. */}
          <div aria-hidden className="pointer-events-none flex select-none flex-col gap-2.5 p-3 opacity-60 blur-[3px]">
            <div className="flex h-7 gap-1 rounded-lg bg-background/50 p-0.5">
              <span className="flex-1 rounded-md bg-primary" />
              <span className="flex-1" />
            </div>
            <div className="h-4 w-3/4 rounded bg-foreground/15" />
            <div className="h-4 w-1/2 rounded bg-foreground/10" />
            <div className="flex gap-1">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className="size-2 rounded-full bg-primary" style={{ opacity: 0.3 + i * 0.05 }} />
              ))}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[color-mix(in_srgb,var(--card)_65%,transparent)] p-3 text-center">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <LockIcon className="size-3.5 text-primary" />
              Калькулятор марафона
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">Темп, дата финиша, выходные — для участников</p>
            <Link
              to="/register"
              className="mt-0.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-fuchsia-500 px-3 text-xs font-bold text-white transition-transform active:scale-95"
            >
              <SparklesIcon className="size-3.5" />
              Вступить бесплатно
            </Link>
          </div>
        </div>
      )}

      {series && authed && (
        <div className="flex flex-1 flex-col gap-2.5 border-t border-border/50 pt-3">
          <Stepper
            label={listed > 0 && watchedSet == null ? "Уже посмотрено · из списка" : "Уже посмотрено"}
            value={watched}
            min={0}
            max={episodes - 1}
            onChange={setWatched}
          />

          <div className="flex gap-1 rounded-lg border border-border/60 bg-background/40 p-0.5">
            <button type="button" onClick={() => setMode("perDay")} className={tab(mode === "perDay")}>
              {t("detail.quickFacts.byPerDay")}
            </button>
            <button type="button" onClick={() => setMode("byDate")} className={tab(mode === "byDate")}>
              {t("detail.quickFacts.byDate")}
            </button>
          </div>

          {mode === "perDay" ? (
            <Stepper
              label={t("detail.quickFacts.paceLabel")}
              value={Math.min(perDay, left)}
              min={1}
              max={Math.min(maxPerDay, left)}
              onChange={setPerDay}
            />
          ) : (
            <Stepper label={`Успеть к ${targetLabel}, дней`} value={byDays} min={1} max={365} onChange={setByDays} />
          )}

          <button
            type="button"
            role="switch"
            aria-checked={weekends}
            onClick={() => setWeekends((w) => !w)}
            className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <CalendarDaysIcon className="size-3.5" />
              Только по выходным
            </span>
            <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", weekends ? "bg-primary" : "bg-foreground/15")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", weekends ? "left-[1.125rem]" : "left-0.5")} />
            </span>
          </button>

          <div
            key={`${mode}-${pace}-${days}-${weekends}-${watched}`}
            className="mt-auto flex animate-in flex-col gap-1.5 rounded-xl bg-primary/[0.07] p-2.5 duration-200 fade-in-0"
          >
            <p className="text-sm leading-snug">
              {mode === "byDate" && (
                <span className="mr-1 font-semibold text-primary">{t("detail.quickFacts.needPerDay", { n: pace })}</span>
              )}
              {t("detail.quickFacts.finish", { days, date: finishLabel })}
            </p>
            <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              <span>
                Осталось {left} эп. · {formatMinutes(leftMinutes, t)}
              </span>
              {perEp != null && <span>{t("detail.quickFacts.aDay", { minutes: perEp * pace })}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-1" aria-hidden>
              {Array.from({ length: dots }, (_, i) => (
                <span key={i} className="size-2 rounded-full bg-primary" style={{ opacity: 0.25 + 0.75 * ((i + 1) / dots) }} />
              ))}
              {days > dots && <span className="text-[10px] text-muted-foreground">+{days - dots}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Midnight, local time — dates are compared as days, never as moments. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
