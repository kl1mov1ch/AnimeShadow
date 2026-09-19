import type { AnimeDetail } from "@animeshadow/shared";
import { CalendarDaysIcon, ClockIcon, FilmIcon, HeartIcon, TrophyIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Episodes a day, for the "how many days is this" reading. */
const EPISODES_PER_DAY = 2;

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

/**
 * Facts about the title for the space beside the tracking bar: how long the
 * whole thing takes to watch (tap it to count in days instead), episodes and
 * their length, rank, how many people track it or favourited it.
 *
 * One row, never wrapped or cut: the chips flow into a single-line box and
 * whatever does not fit whole drops out of sight — most useful first, so
 * a narrow screen loses the least interesting ones.
 */
export function TitleFacts({ anime, className }: { anime: AnimeDetail; className?: string }) {
  const t = useT();
  const labels = useLabels();
  const [asDays, setAsDays] = useState(false);

  const perEp = minutesPerEpisode(anime.duration);
  const episodes = anime.episodes ?? 0;
  const totalMinutes = perEp && episodes > 0 ? perEp * episodes : null;

  const chips: ReactNode[] = [];

  if (totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const time =
      hours > 0
        ? `${hours} ${t("detail.quickFacts.h")}${mins ? ` ${mins} ${t("detail.quickFacts.min")}` : ""}`
        : `${mins} ${t("detail.quickFacts.min")}`;
    const days = Math.max(1, Math.ceil(episodes / EPISODES_PER_DAY));
    chips.push(
      <button
        key="total"
        type="button"
        onClick={() => setAsDays((v) => !v)}
        title={t("detail.quickFacts.toggleHint")}
        className="group inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--accent-line)] bg-[var(--accent-surface-strong)] px-3 text-xs font-medium text-foreground transition-all hover:border-[var(--accent-ink)] active:scale-95"
      >
        {asDays ? (
          <CalendarDaysIcon className="size-3.5 text-[var(--accent-ink)] transition-transform group-hover:rotate-12" />
        ) : (
          <ClockIcon className="size-3.5 text-[var(--accent-ink)] transition-transform group-hover:rotate-12" />
        )}
        <span key={asDays ? "d" : "t"} className="animate-in fade-in slide-in-from-bottom-1">
          {asDays
            ? t("detail.quickFacts.byDays", { days, perDay: EPISODES_PER_DAY })
            : t("detail.quickFacts.totalTime", { time })}
        </span>
      </button>,
    );
  }
  if (perEp && episodes > 1) {
    chips.push(
      <Fact key="eps" icon={<FilmIcon />}>
        {t("detail.quickFacts.perEpisode", { episodes, minutes: perEp })}
      </Fact>,
    );
  }
  if (anime.rank != null && anime.rank > 0) {
    chips.push(
      <Fact key="rank" icon={<TrophyIcon />}>
        {t("detail.quickFacts.rank", { rank: labels.plain(anime.rank) })}
      </Fact>,
    );
  }
  if (anime.members) {
    chips.push(
      <Fact key="members" icon={<UsersIcon />}>
        {t("detail.quickFacts.members", { count: labels.compact(anime.members) })}
      </Fact>,
    );
  }
  if (anime.favorites) {
    chips.push(
      <Fact key="fav" icon={<HeartIcon />}>
        {t("detail.quickFacts.favorites", { count: labels.compact(anime.favorites) })}
      </Fact>,
    );
  }
  if (anime.studios[0]) {
    chips.push(<Fact key="studio">{anime.studios[0]}</Fact>);
  }

  if (chips.length === 0) return null;
  return (
    <div className={cn("flex h-8 flex-wrap items-center justify-end gap-2 overflow-hidden", className)}>
      {chips}
    </div>
  );
}

function Fact({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 bg-card/40 px-3 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:text-[var(--accent-ink)]">
      {icon}
      {children}
    </span>
  );
}
