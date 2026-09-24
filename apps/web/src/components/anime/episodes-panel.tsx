import type { AnimeDetail } from "@animeshadow/shared";
import {
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  InfoIcon,
  ListVideoIcon,
  type LucideIcon,
  RadioIcon,
  TvIcon,
} from "lucide-react";
import { useT } from "@/i18n";
import { useEpisodeCatalog } from "@/lib/episodes";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * The facts column beside the synopsis.
 *
 * Only what isn't already in the header above it. Genres and the Japanese
 * title used to be repeated here verbatim, which made the page say the same
 * thing twice within one screen; what stays is what a viewer deciding
 * whether to start would still ask — who made it, when, how long, how far
 * along it is.
 *
 * "Episodes" is what can actually be watched against what is planned, for
 * a show still airing: "9 / 24" answers the question people actually have,
 * which is how much is out.
 */
export function InfoSidebar({
  anime,
  className,
}: {
  anime: AnimeDetail;
  className?: string;
}) {
  const t = useT();
  const labels = useLabels();
  const { available } = useEpisodeCatalog(anime.id);

  const episodes =
    available != null && anime.episodes != null && available < anime.episodes
      ? `${available} / ${anime.episodes}`
      : anime.episodes
        ? String(anime.episodes)
        : available != null
          ? String(available)
          : null;

  const rows = (
    [
      [
        BuildingIcon,
        t("detail.facts.studios"),
        anime.studios.length > 0 ? anime.studios.slice(0, 2).join(", ") : null,
      ],
      [CalendarIcon, t("detail.facts.aired"), anime.year != null ? String(anime.year) : null],
      [TvIcon, t("detail.facts.format"), labels.typeLabel(anime.type)],
      [ListVideoIcon, t("detail.facts.episodes"), episodes],
      [ClockIcon, t("detail.facts.duration"), anime.duration],
      [
        RadioIcon,
        t("detail.facts.status"),
        <span
          key="status"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
            anime.airing === "AIRING"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-secondary text-foreground/80",
          )}
        >
          {anime.airing === "AIRING" && (
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          )}
          {labels.airingLabel(anime.airing)}
        </span>,
      ],
    ] as Array<[LucideIcon, string, React.ReactNode]>
  ).filter(([, , value]) => value != null && value !== "—");

  return (
    <aside
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5",
        className,
      )}
    >
      <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--accent-line-soft)] bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]"
        >
          <InfoIcon className="size-4" />
        </span>
        {t("detail.sections.info")}
      </h2>

      {/* Rows spread over the column's full height, so beside a long
          synopsis the card is evenly filled rather than a short list with
          a blank block under it. */}
      <dl className="reveal-group flex flex-1 flex-col justify-between">
        {rows.map(([Icon, label, value], i) => (
          <div
            key={label}
            style={{ "--i": i } as React.CSSProperties}
            className="reveal flex items-center justify-between gap-3 border-b border-border/40 py-2 text-sm last:border-b-0"
          >
            <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
              <Icon className="size-3.5 text-[var(--accent-ink)]" />
              {label}
            </dt>
            <dd className="min-w-0 truncate text-right font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
