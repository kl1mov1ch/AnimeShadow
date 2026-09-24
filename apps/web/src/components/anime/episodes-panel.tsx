import type { AnimeDetail } from "@animeshadow/shared";
import { CheckIcon, PlayIcon, SearchIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useAnimeProgress, useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * How many episodes fit on one page, by how many there are in total.
 *
 * A 12-episode show wants them all at once; a 1000-episode one wants
 * ranges. Scaling the page size means the control that appears — "show
 * more" versus a row of range chips — follows from the show rather than
 * from a constant that is wrong for most of the catalogue.
 */
function pageSizeFor(total: number): number {
  if (total <= 26) return total;
  if (total <= 120) return 50;
  return 100;
}

/**
 * Per-episode stills, when the player's own provider publishes them.
 *
 * Kodik returns a handful of screenshots for each episode alongside that
 * episode's embed page, so the first of them is a picture of *that*
 * episode rather than a stand-in. Sources are walked in the order the API
 * ranked them, and the first one that has a still for a given number wins;
 * an episode nobody has a picture for simply gets none, which is why the
 * tile below still has to read correctly with no image at all.
 */
function useEpisodeStills(animeId: number): Map<number, string> {
  const { data } = useWatchSources(animeId);
  return useMemo(() => {
    const stills = new Map<number, string>();
    for (const source of data?.sources ?? []) {
      for (const [number, episode] of Object.entries(source.iframeEpisodes ?? {})) {
        const thumb = episode.thumbs[0];
        if (!thumb) continue;
        const n = Number(number);
        if (Number.isInteger(n) && !stills.has(n)) stills.set(n, thumb);
      }
    }
    return stills;
  }, [data]);
}

/**
 * The episode list.
 *
 * A tile is a number first and a picture second: the catalogue knows how
 * many episodes a title has, but only the player's provider knows what any
 * one of them looks like, and only for some titles. So the still is a
 * backdrop that the number, the runtime and the watched state sit on top
 * of — everything stays readable on the tiles that have no picture, and
 * nothing is repeated across the grid to fake one.
 */
export function EpisodesPanel({
  anime,
  episode,
  onEpisodeChange,
}: {
  anime: AnimeDetail;
  episode: number;
  onEpisodeChange: (episode: number) => void;
}) {
  const t = useT();
  const { status } = useAuth();
  const { data: progress } = useAnimeProgress(anime.id, status === "authenticated");
  const stills = useEpisodeStills(anime.id);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(0);

  const total = anime.episodes ?? 0;
  const size = pageSizeFor(total);
  const rangeCount = Math.ceil(total / size);

  const watched = useMemo(() => {
    const map = new Map<number, { completed: boolean; position: number }>();
    for (const row of progress?.episodes ?? []) {
      map.set(row.episode, { completed: row.completed, position: row.positionSeconds });
    }
    return map;
  }, [progress]);

  const numbers = useMemo(() => {
    const q = query.trim();
    if (q) {
      // Searching a list of numbers means searching by number — matching the
      // digits anywhere is what makes "12" find 12, 120 and 212.
      return Array.from({ length: total }, (_, i) => i + 1).filter((n) =>
        String(n).includes(q),
      );
    }
    const from = range * size;
    return Array.from({ length: Math.min(size, total - from) }, (_, i) => from + i + 1);
  }, [total, query, range, size]);

  if (total <= 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">
          {t("detail.sections.episodes")}
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
            {total}
          </span>
        </h2>
        {total > 26 && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="search"
              inputMode="numeric"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("detail.episodeSearch")}
              className="h-8 w-36 rounded-full border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-44"
            />
          </div>
        )}
      </div>

      {/* Ranges rather than an ever-growing list: on a long-running show the
          episode you want is a number you already know, and paging to it
          beats scrolling to it. */}
      {!query && rangeCount > 1 && (
        <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: rangeCount }, (_, i) => {
            const from = i * size + 1;
            const to = Math.min(total, (i + 1) * size);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setRange(i)}
                className={cn(
                  "shrink-0 snap-start rounded-lg border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                  i === range
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {from}–{to}
              </button>
            );
          })}
        </div>
      )}

      {numbers.length === 0 ? (
        <p className="rounded-xl bg-secondary/30 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("detail.episodeNone")}
        </p>
      ) : (
        <div className="reveal-group grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {numbers.map((n, i) => {
            const state = watched.get(n);
            const current = n === episode;
            const done = state?.completed ?? false;
            const still = stills.get(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => onEpisodeChange(n)}
                aria-current={current}
                title={t("detail.episodeNumber", { n })}
                style={{ "--i": i % 24 } as CSSProperties}
                className={cn(
                  "reveal group relative flex aspect-[4/3] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-0.5",
                  current
                    ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                    : done
                      ? "border-emerald-500/40 bg-emerald-500/[0.07] hover:border-emerald-500/70"
                      : "border-border/60 bg-card/50 hover:border-primary/40",
                )}
              >
                {/* The provider's own still for this episode, dimmed so the
                    number stays the thing you read. It fades itself in, and
                    removes itself outright if the URL is dead — a broken
                    image icon behind the number would be worse than none. */}
                {still && (
                  <img
                    src={still}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="absolute inset-0 size-full object-cover opacity-45 transition-opacity duration-300 group-hover:opacity-70"
                  />
                )}
                {still && (
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/45 to-background/10"
                  />
                )}

                <span
                  className={cn(
                    "relative font-display text-base leading-none tabular-nums drop-shadow-sm sm:text-lg",
                    current ? "text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                  )}
                >
                  {n}
                </span>
                {anime.duration && (
                  <span className="relative truncate px-1 text-[10px] leading-none text-muted-foreground">
                    {anime.duration}
                  </span>
                )}

                {/* One mark per state, never two. */}
                {done && !current && (
                  <span className="absolute right-1 top-1 grid size-3.5 place-items-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="size-2.5" strokeWidth={3} />
                  </span>
                )}
                {current && (
                  <span className="absolute right-1 top-1 grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <PlayIcon className="size-2 fill-current" />
                  </span>
                )}

                {/* Started but not finished — how far in they got. */}
                {state && !done && state.position > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20">
                    <span className="block h-full w-1/3 bg-primary" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The facts column beside the episodes. Only what a viewer deciding
 * whether to watch would ask: who made it, when, how long, how far along.
 * Ids and other bookkeeping belong to the catalogue, not to this card.
 */
export function InfoSidebar({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const labels = useLabels();

  const rows: Array<[string, React.ReactNode]> = (
    [
      [
        t("detail.facts.studios"),
        anime.studios.length > 0 ? anime.studios.slice(0, 2).join(", ") : null,
      ],
      [t("detail.facts.aired"), anime.year != null ? String(anime.year) : null],
      [t("detail.facts.format"), labels.typeLabel(anime.type)],
      [t("detail.facts.episodes"), anime.episodes ? String(anime.episodes) : null],
      [t("detail.facts.duration"), anime.duration],
      [
        t("detail.facts.status"),
        <span
          key="status"
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            anime.airing === "AIRING"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-secondary text-foreground/80",
          )}
        >
          {labels.airingLabel(anime.airing)}
        </span>,
      ],
    ] as Array<[string, React.ReactNode]>
  ).filter(([, value]) => value != null && value !== "—");

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.sections.info")}
      </h2>

      <dl className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-border/40 py-2 text-sm last:border-b-0"
          >
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {anime.titleJapanese && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("detail.japaneseTitle")}</span>
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{anime.titleJapanese}</p>
        </div>
      )}

      {anime.genresDetailed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t("detail.facts.genres")}</span>
          <div className="flex flex-wrap gap-1.5">
            {anime.genresDetailed.map((genre) => (
              <Link key={genre.id} to={`/browse?genres=${genre.id}`} viewTransition>
                <Badge variant="secondary" className="cursor-pointer font-normal">
                  {labels.genreLabel(genre.name)}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
