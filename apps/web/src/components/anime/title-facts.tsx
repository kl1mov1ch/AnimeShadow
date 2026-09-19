import type { AnimeDetail } from "@animeshadow/shared";
import {
  BuildingIcon,
  ClockIcon,
  FilmIcon,
  FlagIcon,
  HeartIcon,
  CalculatorIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * The "time calculator" button that sits at the end of the tracking bar —
 * an icon on phones, labelled from sm up — opening a popover with how long
 * the title takes, a marathon calculator and the rest of its numbers.
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
 * The popover: the title's numbers as a list, then the marathon calculator — drag
 * the episodes-a-day slider and the finish date and the row of days answer.
 * Nothing animates on its own; everything moves only in reply to the slider.
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
  const days = episodes > 0 ? Math.ceil(episodes / perDay) : 0;
  const finish = new Date(Date.now() + Math.max(0, days - 1) * 86_400_000);
  const finishLabel = finish.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const minutesADay = perEp ? perEp * perDay : null;
  // One dot per day, capped so a very long show stays a row, not a wall.
  const dots = Math.min(days, 40);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "group inline-flex size-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--accent-line)] bg-[var(--accent-surface)] text-xs font-medium transition-colors hover:bg-[var(--accent-surface-strong)] data-[state=open]:bg-[var(--accent-surface-strong)] sm:w-auto sm:px-3",
            className,
          )}
        >
          <CalculatorIcon className="size-4 text-[var(--accent-ink)] transition-transform duration-300 group-hover:-rotate-12 group-data-[state=open]:rotate-6 sm:size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
        <p className="flex items-center gap-2 font-display text-sm">
          <CalculatorIcon className="size-4 text-[var(--accent-ink)]" />
          {label}
        </p>
        <ul className="flex flex-col gap-0.5">
          {facts.map((f, i) => (
            <li
              key={f.key}
              className="animate-in fade-in slide-in-from-right-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--accent-ink)]"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
            >
              {f.icon}
              <span className="min-w-0">{f.text}</span>
            </li>
          ))}
        </ul>

        {episodes > 1 && (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FlagIcon className="size-3.5 text-[var(--accent-ink)]" />
              {t("detail.quickFacts.marathon")}
            </p>
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
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {t("detail.quickFacts.perDay", { n: perDay })}
              </span>
            </div>
            <p key={perDay} className="animate-in fade-in text-sm">
              {t("detail.quickFacts.finish", { days, date: finishLabel })}
              {minutesADay != null && (
                <span className="text-muted-foreground"> · {t("detail.quickFacts.aDay", { minutes: minutesADay })}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-1" aria-hidden>
              {Array.from({ length: dots }, (_, i) => (
                <span
                  key={i}
                  className="size-2 rounded-full bg-[var(--accent-ink)] transition-opacity duration-300"
                  style={{ opacity: 0.25 + 0.75 * ((i + 1) / dots) }}
                />
              ))}
              {days > dots && <span className="text-[10px] text-muted-foreground">+{days - dots}</span>}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
