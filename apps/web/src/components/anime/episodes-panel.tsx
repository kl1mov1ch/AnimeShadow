import type { AnimeDetail } from "@animeshadow/shared";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  SearchIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useAnimeProgress, useUpdateProgress, useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

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
export function useEpisodeStills(animeId: number): Map<number, string> {
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
 * How far one arrow press moves the rail: most of a screenful, with a
 * sliver of overlap, so the episode you were looking at is still on screen
 * afterwards and you never lose your place.
 */
const PAGE_FRACTION = 0.85;

/**
 * The episode rail.
 *
 * One row, scrolled rather than paged. Paging meant a long-running show
 * turned into a wall of range chips you had to decode ("is 418 in
 * 401–500?") before you could start looking; a rail is the same gesture at
 * 12 episodes and at 1200, and it opens with the episode you are actually
 * on in the middle of the screen rather than somewhere on page five.
 *
 * Three ways to move, because they suit different distances: wheel or drag
 * for a few, the arrows for a screenful, the number box for anywhere at
 * all. The box scrolls rather than filters — the episodes on either side
 * are the context that tells you where you landed, and a filtered list of
 * exactly one tile throws that away.
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
  const authed = status === "authenticated";
  const { data: progress } = useAnimeProgress(anime.id, authed);
  const update = useUpdateProgress(anime.id);
  const stills = useEpisodeStills(anime.id);
  const [query, setQuery] = useState("");

  const railRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const total = anime.episodes ?? 0;

  const watched = useMemo(() => {
    const map = new Map<number, { completed: boolean; position: number }>();
    for (const row of progress?.episodes ?? []) {
      map.set(row.episode, { completed: row.completed, position: row.positionSeconds });
    }
    return map;
  }, [progress]);

  const numbers = useMemo(
    () => Array.from({ length: total }, (_, i) => i + 1),
    [total],
  );

  /** Puts one episode in the middle of the rail without moving the page. */
  const scrollToEpisode = (n: number, behavior: ScrollBehavior = "smooth") => {
    const rail = railRef.current;
    const tile = rail?.querySelector<HTMLElement>(`[data-episode="${n}"]`);
    if (!rail || !tile) return;
    rail.scrollTo({
      left: tile.offsetLeft - rail.clientWidth / 2 + tile.offsetWidth / 2,
      behavior,
    });
  };

  const syncEdges = () => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setEdges({ start: rail.scrollLeft > 4, end: rail.scrollLeft < max - 4 });
  };

  // Open on the episode that is actually loaded, not on episode 1 — on a
  // long show those are hundreds of tiles apart. Jumps rather than
  // animates, so it reads as where the rail already was instead of as a
  // scroll nobody asked for.
  useEffect(() => {
    scrollToEpisode(episode, "auto");
    syncEdges();
  }, [episode, total]);

  // A wheel over a horizontal rail should move the rail. Only while it has
  // somewhere left to go that way, though: swallowing the gesture at either
  // end traps the page, which is worse than not handling it at all.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const max = rail.scrollWidth - rail.clientWidth;
      const atEnd = delta > 0 ? rail.scrollLeft >= max - 1 : rail.scrollLeft <= 1;
      if (atEnd) return;
      e.preventDefault();
      rail.scrollBy({ left: delta, behavior: "auto" });
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, [total]);

  const page = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * PAGE_FRACTION,
      behavior: "smooth",
    });
  };

  const jump = () => {
    const parsed = Number.parseInt(query.trim(), 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(1, parsed), total);
    onEpisodeChange(clamped);
    scrollToEpisode(clamped);
  };

  /** Ticking an episode by hand — the counterpart to the automatic mark. */
  const toggleWatched = (n: number) => {
    const state = watched.get(n);
    update.mutate({
      episode: n,
      positionSeconds: state?.position ?? 0,
      completed: !(state?.completed ?? false),
    });
  };

  if (total <= 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">
          {t("detail.sections.episodes")}
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
            {total}
          </span>
        </h2>

        <div className="ml-auto flex items-center gap-1.5">
          {total > 12 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                type="search"
                inputMode="numeric"
                value={query}
                onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") jump();
                }}
                onBlur={jump}
                placeholder={t("detail.episodeSearch")}
                className="h-8 w-28 rounded-lg border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-36"
              />
            </div>
          )}
          <RailArrow
            label={t("detail.episodesPrev")}
            disabled={!edges.start}
            onClick={() => page(-1)}
          >
            <ChevronLeftIcon className="size-4" />
          </RailArrow>
          <RailArrow
            label={t("detail.episodesNext")}
            disabled={!edges.end}
            onClick={() => page(1)}
          >
            <ChevronRightIcon className="size-4" />
          </RailArrow>
        </div>
      </div>

      <div className="relative">
        {/* The rail fades out at whichever end still has episodes past it,
            so "there is more this way" shows without needing a label. */}
        {edges.start && <RailFade side="left" />}
        {edges.end && <RailFade side="right" />}

        <div
          ref={railRef}
          onScroll={syncEdges}
          className="reveal-group -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {numbers.map((n, i) => (
            <EpisodeTile
              key={n}
              n={n}
              index={i}
              still={stills.get(n)}
              duration={anime.duration}
              current={n === episode}
              state={watched.get(n)}
              canMark={authed}
              onOpen={() => onEpisodeChange(n)}
              onToggleWatched={() => toggleWatched(n)}
              markLabel={t("detail.episodeMark")}
              title={t("detail.episodeNumber", { n })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RailArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/40 text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RailFade({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-10",
        side === "left"
          ? "left-0 bg-gradient-to-r from-[var(--accent-surface)] to-transparent"
          : "right-0 bg-gradient-to-l from-[var(--accent-surface)] to-transparent",
      )}
    />
  );
}

/**
 * One episode.
 *
 * The frame, where the provider published one *and* it actually loads.
 * Both halves matter: a fair share of the published URLs 404 or time out,
 * and a tile holding space for a picture that never arrives looks broken
 * in a way a tile that never wanted one does not. So a failed load is
 * remembered and that tile falls back to the plain numbered form instead
 * of leaving a hole in the row.
 */
function EpisodeTile({
  n,
  index,
  still,
  duration,
  current,
  state,
  canMark,
  onOpen,
  onToggleWatched,
  markLabel,
  title,
}: {
  n: number;
  index: number;
  still: string | undefined;
  duration: string | null;
  current: boolean;
  state: { completed: boolean; position: number } | undefined;
  canMark: boolean;
  onOpen: () => void;
  onToggleWatched: () => void;
  markLabel: string;
  title: string;
}) {
  const [broken, setBroken] = useState(false);
  const art = still && !broken ? still : null;
  const done = state?.completed ?? false;

  return (
    <div
      data-episode={n}
      style={{ "--i": index % 20 } as CSSProperties}
      className={cn(
        "reveal group relative w-36 shrink-0 snap-start overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-0.5 sm:w-44",
        current
          ? "border-primary shadow-md shadow-primary/20"
          : done
            ? "border-emerald-500/40 hover:border-emerald-500/70"
            : "border-border/60 hover:border-primary/40",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={current}
        title={title}
        className={cn(
          "flex aspect-video w-full flex-col items-center justify-center gap-0.5",
          current ? "bg-primary/10" : done ? "bg-emerald-500/[0.07]" : "bg-card/50",
        )}
      >
        {art && (
          <img
            src={art}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {art ? (
          <>
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2 pb-1.5">
              <span
                className={cn(
                  "font-display text-sm leading-none tabular-nums sm:text-base",
                  current ? "text-primary" : done ? "text-emerald-400" : "text-white",
                )}
              >
                {n}
              </span>
              {duration && (
                <span className="truncate text-[10px] leading-none text-white/70">
                  {duration}
                </span>
              )}
            </span>
            <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="grid size-9 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-lg">
                <PlayIcon className="size-4 fill-current" />
              </span>
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-display text-lg leading-none tabular-nums",
                current
                  ? "text-primary"
                  : done
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground",
              )}
            >
              {n}
            </span>
            {duration && (
              <span className="truncate px-1 text-[10px] leading-none text-muted-foreground">
                {duration}
              </span>
            )}
          </>
        )}
      </button>

      {/* Marking an episode by hand, as its own control rather than a state
          the tile only ever reports. Outside the open button on purpose, so
          a tick never costs you the episode you were already watching. */}
      {canMark && (
        <button
          type="button"
          onClick={onToggleWatched}
          aria-pressed={done}
          aria-label={markLabel}
          title={markLabel}
          className={cn(
            "absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-full border transition-all duration-200 active:scale-90",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-white/40 bg-black/40 text-white/70 opacity-0 backdrop-blur-sm hover:border-emerald-400 hover:text-white focus-visible:opacity-100 group-hover:opacity-100",
          )}
        >
          <CheckIcon className="size-3.5" strokeWidth={3} />
        </button>
      )}

      {current && (
        <span className="absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
          <PlayIcon className="size-2.5 fill-current" />
        </span>
      )}

      {/* Started but not finished — how far in they got. */}
      {state && !done && state.position > 0 && (
        <span className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary/20">
          <span className="block h-full w-1/3 bg-primary" />
        </span>
      )}
    </div>
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
