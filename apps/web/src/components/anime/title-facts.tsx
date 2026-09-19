import type { AnimeDetail } from "@animeshadow/shared";
import {
  BuildingIcon,
  ClockIcon,
  FilmIcon,
  FlagIcon,
  HeartIcon,
  ScrollTextIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
 * Facts about the title beside the tracking bar. As many as fit whole stay
 * on the line; the rest — and a small marathon calculator — live in the
 * "Otaku cheat sheet" popover, whose button says how many are tucked away.
 * Nothing wraps, nothing is cut mid-word.
 */
export function TitleFacts({ anime, className }: { anime: AnimeDetail; className?: string }) {
  const t = useT();
  const { facts, perEp, episodes } = useFacts(anime);
  const row = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);

  // How many chips the single-line row had to push onto its (invisible)
  // second line — or all of them while the row itself is hidden (phones).
  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    if (el.offsetParent === null) {
      setHidden(kids.length);
      return;
    }
    const top = kids[0]?.offsetTop ?? 0;
    setHidden(kids.filter((k) => k.offsetTop > top).length);
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, facts.length]);

  if (facts.length === 0) return null;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        ref={row}
        className="hidden h-8 min-w-0 flex-1 flex-wrap items-center justify-end gap-2 overflow-hidden md:flex"
      >
        {facts.map((f) => (
          <FactChip key={f.key} fact={f} />
        ))}
      </div>
      <CheatSheet
        facts={facts}
        perEp={perEp}
        episodes={episodes}
        tucked={hidden}
        label={t("detail.quickFacts.sheet")}
      />
    </div>
  );
}

function FactChip({ fact }: { fact: Fact }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs [&_svg]:size-3.5 [&_svg]:text-[var(--accent-ink)]",
        fact.accent
          ? "border-[var(--accent-line)] bg-[var(--accent-surface-strong)] font-medium text-foreground"
          : "border-border/50 bg-card/40 text-muted-foreground",
      )}
    >
      {fact.icon}
      {fact.text}
    </span>
  );
}

/**
 * The popover: every fact as a list, then the marathon calculator — drag
 * the episodes-a-day slider and the finish date and the row of days answer.
 * Nothing animates on its own; everything moves only in reply to the slider.
 */
function CheatSheet({
  facts,
  perEp,
  episodes,
  tucked,
  label,
}: {
  facts: Fact[];
  perEp: number | null;
  episodes: number;
  tucked: number;
  label: string;
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
          className="group inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--accent-line)] bg-[var(--accent-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--accent-surface-strong)] data-[state=open]:bg-[var(--accent-surface-strong)]"
        >
          <ScrollTextIcon className="size-3.5 text-[var(--accent-ink)] transition-transform duration-300 group-hover:-rotate-12 group-data-[state=open]:rotate-6" />
          {label}
          {tucked > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-[var(--accent-ink)] px-1 text-[10px] font-semibold text-background">
              +{tucked}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
        <p className="flex items-center gap-2 font-display text-sm">
          <ScrollTextIcon className="size-4 text-[var(--accent-ink)]" />
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
