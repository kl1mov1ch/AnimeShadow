import type { AnimeDetail } from "@animeshadow/shared";
import {
  BuildingIcon,
  CalculatorIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FilmIcon,
  FlagIcon,
  HeartIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale, useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
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

interface Fact {
  key: string;
  icon: ReactNode;
  text: string;
  accent?: boolean;
}

function useFacts(anime: AnimeDetail) {
  const t = useT();
  const labels = useLabels();
  const perEp = minutesPerEpisode(anime.duration);
  const episodes = anime.episodes ?? 0;
  const totalMinutes = perEp && episodes > 0 ? perEp * episodes : null;

  const facts: Fact[] = [];
  if (totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const time =
      hours > 0
        ? `${hours} ${t("detail.quickFacts.h")}${mins ? ` ${mins} ${t("detail.quickFacts.min")}` : ""}`
        : `${mins} ${t("detail.quickFacts.min")}`;
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
  return { facts, perEp, episodes };
}

/**
 * The "time calculator" — an icon on the tracking bar, nothing else. It used
 * to spell its own name out next to the icon at every width the bar had
 * room for; a tooltip says the same thing on demand instead, the way every
 * other icon-only control on the bar already works.
 */
export function TitleFacts({ anime, className }: { anime: AnimeDetail; className?: string }) {
  const t = useT();
  const { facts, perEp, episodes } = useFacts(anime);
  if (facts.length === 0) return null;
  return (
    <CheatSheet
      className={className}
      facts={facts}
      perEp={perEp}
      episodes={episodes}
      label={t("detail.quickFacts.sheet")}
    />
  );
}

/**
 * The calculator used to be a popover wearing the title's own accent colour
 * — a different shade of icon, border and highlight on every single title,
 * while every confirmation and warning dialog on the rest of the site
 * shares one fixed palette. That mismatch, not the accent colour itself,
 * was what read as "doesn't belong here". It's a modal now, built from the
 * exact same pieces those dialogs are (`Dialog`, the site's own mark in a
 * rounded badge at the top, one plain palette throughout), so this looks
 * like AnimeShadow's dialog rather than like this one title's colour
 * scheme wearing a calculator's clothes.
 */
function CheatSheet({
  facts,
  perEp,
  episodes,
  label,
  className,
}: {
  facts: Fact[];
  perEp: number | null;
  episodes: number;
  label: string;
  className?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const maxPerDay = Math.max(1, Math.min(24, episodes));
  const [perDay, setPerDay] = useState(Math.min(2, maxPerDay));
  // Two ways to ask the same question: "at this pace, when do I finish" or
  // "by this date, what pace do I need" — the slider drives the first, the
  // calendar the second, and both land on the same days/finish/minutes line
  // below rather than each drawing its own separate result.
  const [mode, setMode] = useState<"perDay" | "byDate">("perDay");
  const [targetDate, setTargetDate] = useState(() => startOfDay(new Date()));

  const daysUntilTarget = Math.max(1, Math.round((targetDate.getTime() - startOfDay(new Date()).getTime()) / 86_400_000));
  const impliedPerDay =
    mode === "byDate" ? Math.min(maxPerDay, Math.max(1, Math.ceil(episodes / daysUntilTarget))) : perDay;

  const days = episodes > 0 ? Math.ceil(episodes / impliedPerDay) : 0;
  const finish = new Date(Date.now() + Math.max(0, days - 1) * 86_400_000);
  const finishLabel = finish.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const minutesADay = perEp ? perEp * impliedPerDay : null;
  // One dot per day, capped so a very long show stays a row, not a wall.
  const dots = Math.min(days, 40);

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary data-[state=open]:border-primary/40 data-[state=open]:text-primary",
                className,
              )}
            >
              <CalculatorIcon className="size-4" />
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>

      <DialogContent className="overflow-hidden sm:max-w-sm">
        {/* The site's own mark, faint and oversized in the corner — the
            same "a picture would be the wrong picture, the mark is the
            right one" idea the free plan and the empty-header fallback
            already use elsewhere on the page. */}
        <LogoGlyph
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -right-6 -z-10 size-36 text-foreground/[0.04]"
        />
        <DialogHeader className="items-center gap-2.5 text-center sm:text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <CalculatorIcon className="size-6" />
          </span>
          <DialogTitle className="text-base">{label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-0.5">
            {facts.map((f, i) => (
              <li
                key={f.key}
                className="animate-in fade-in slide-in-from-right-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/60 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
              >
                {f.icon}
                <span className="min-w-0">{f.text}</span>
              </li>
            ))}
          </ul>

          {episodes > 1 && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FlagIcon className="size-3.5" />
                  {t("detail.quickFacts.marathon")}
                </p>
                {/* Two questions, one answer below — switching which one
                    you ask doesn't reset the other; picking a date and
                    going back to the slider still remembers where it was. */}
                <div className="flex rounded-full border border-border/60 bg-background/60 p-0.5 text-[11px] font-medium">
                  {(["perDay", "byDate"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded-lg px-2 py-1 transition-colors",
                        mode === m
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(m === "perDay" ? "detail.quickFacts.byPerDay" : "detail.quickFacts.byDate")}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "perDay" ? (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={maxPerDay}
                    value={perDay}
                    onChange={(e) => setPerDay(Number(e.target.value))}
                    aria-label={t("detail.quickFacts.perDay", { n: perDay })}
                    className="theme-scrubber min-w-0 flex-1"
                    style={{ ["--played" as string]: `${maxPerDay > 1 ? ((perDay - 1) / (maxPerDay - 1)) * 100 : 100}%` }}
                  />
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t("detail.quickFacts.perDay", { n: perDay })}
                  </span>
                </div>
              ) : (
                <MiniCalendar value={targetDate} onChange={setTargetDate} locale={locale} />
              )}

              <p key={`${mode}-${impliedPerDay}-${days}`} className="animate-in fade-in text-sm text-foreground">
                {mode === "byDate" && (
                  <span className="mr-1 font-semibold text-primary">
                    {t("detail.quickFacts.needPerDay", { n: impliedPerDay })}
                  </span>
                )}
                {t("detail.quickFacts.finish", { days, date: finishLabel })}
                {minutesADay != null && (
                  <span className="text-muted-foreground"> · {t("detail.quickFacts.aDay", { minutes: minutesADay })}</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-1" aria-hidden>
                {Array.from({ length: dots }, (_, i) => (
                  <span
                    key={i}
                    className="size-2 rounded-full bg-primary transition-opacity duration-300"
                    style={{ opacity: 0.25 + 0.75 * ((i + 1) / dots) }}
                  />
                ))}
                {days > dots && <span className="text-[10px] text-muted-foreground">+{days - dots}</span>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Midnight, local time — dates are compared as days, never as moments. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * A month grid, drawn in the site's own fixed palette rather than whatever
 * the platform's native date input renders — a grey system control was the
 * one piece of this dialog that never looked like it belonged to it. One
 * month at a time, arrows to move between them, today ringed, the chosen
 * day filled solid, and every day before today disabled outright — there is
 * no "marathon finished yesterday".
 */
function MiniCalendar({
  value,
  onChange,
  locale,
}: {
  value: Date;
  onChange: (date: Date) => void;
  locale: string;
}) {
  const t = useT();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const monthLabel = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  // Monday-first, the way the rest of the site's week already reads —
  // JS's own getDay() is Sunday-first, so this just rotates it once.
  const weekdays = useMemo(() => {
    const monday = new Date(2024, 0, 1); // a known Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return weekdayFormatter.format(d).slice(0, 2);
    });
  }, [weekdayFormatter]);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Never lets the visible month land before the one "today" is in — the
  // slider can point at a past finish date, but there is nowhere to click
  // that would actually mean one.
  const atEarliestMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={atEarliestMonth}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label={t("detail.quickFacts.prevMonth")}
          className="grid size-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <p className="text-xs font-medium capitalize text-foreground">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label={t("detail.quickFacts.nextMonth")}
          className="grid size-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w, i) => (
          <span key={i} className="py-0.5 text-[10px] uppercase text-muted-foreground/60">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />;
          const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          const isToday = date.getTime() === today.getTime();
          const isSelected = date.getTime() === value.getTime();
          const isPast = date.getTime() < today.getTime();
          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onChange(date)}
              className={cn(
                "grid size-7 place-items-center rounded-lg text-xs tabular-nums transition-colors",
                isPast && "text-muted-foreground/30",
                !isPast && !isSelected && "text-foreground hover:bg-secondary",
                isSelected && "bg-primary font-semibold text-primary-foreground",
                !isSelected && isToday && "ring-1 ring-inset ring-primary/50",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
