import type { WatchSource } from "@animeshadow/shared";
import { CheckIcon, SearchIcon, StarIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DrawnCheck } from "@/components/ui/morph-icon";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export type EpisodeState = { completed: boolean; position: number };

/**
 * Everything you change while watching, in one column beside the picture.
 *
 * Episodes and dubs used to live in two separate places — a rail in its own
 * section below the player and a row of cards under the control bar — which
 * meant the two things you actually reach for mid-episode were the two
 * furthest from the video. Here they share one panel the height of the
 * player, and switching between them is a tab rather than a scroll.
 *
 * Only ever one list is on screen, and it is the one that scrolls: the
 * panel itself never changes size, so opening a 1200-episode show does not
 * move anything else on the page.
 */
export function PlayerSidePanel({
  episodesTotal,
  episode,
  onEpisodeChange,
  stills,
  duration,
  watched,
  canMark,
  onToggleWatched,
  sources,
  currentSourceId,
  favouriteDub,
  onPickSource,
  onToggleFavourite,
  sourceLabel,
  className,
}: {
  episodesTotal: number | null;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  stills: Map<number, string>;
  duration: string | null;
  watched: Map<number, EpisodeState>;
  canMark: boolean;
  onToggleWatched: (episode: number) => void;
  sources: WatchSource[];
  currentSourceId: string;
  favouriteDub: string | null;
  onPickSource: (id: string) => void;
  onToggleFavourite: (title: string) => void;
  /** Rendering a source's name is the player's business, not this panel's. */
  sourceLabel: (source: WatchSource) => string;
  className?: string;
}) {
  const t = useT();
  const total = episodesTotal ?? 0;
  const hasEpisodes = total > 0;
  const hasDubs = sources.length > 1;
  const [tab, setTab] = useState<"episodes" | "dubs">(
    hasEpisodes ? "episodes" : "dubs",
  );

  // Nothing to put in it — the player takes the full width instead of
  // sitting next to an empty box.
  if (!hasEpisodes && !hasDubs) return null;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm",
        className,
      )}
    >
      {(hasEpisodes ? 1 : 0) + (hasDubs ? 1 : 0) > 1 && (
        <div className="flex shrink-0 gap-0.5 border-b border-border/60 p-1">
          <PanelTab
            active={tab === "episodes"}
            onClick={() => setTab("episodes")}
            label={t("detail.sections.episodes")}
            count={total}
          />
          <PanelTab
            active={tab === "dubs"}
            onClick={() => setTab("dubs")}
            label={t("watch.dubs")}
            count={sources.length}
          />
        </div>
      )}

      {tab === "episodes" && hasEpisodes ? (
        <EpisodeList
          total={total}
          episode={episode}
          onEpisodeChange={onEpisodeChange}
          stills={stills}
          duration={duration}
          watched={watched}
          canMark={canMark}
          onToggleWatched={onToggleWatched}
        />
      ) : (
        <DubList
          sources={sources}
          currentSourceId={currentSourceId}
          favouriteDub={favouriteDub}
          onPickSource={onPickSource}
          onToggleFavourite={onToggleFavourite}
          sourceLabel={sourceLabel}
        />
      )}
    </aside>
  );
}

function PanelTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-200",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

/**
 * The episodes, one per row.
 *
 * A vertical list rather than the old grid of tiles: in a column this
 * narrow a row fits the frame, the number, the runtime and the tick side
 * by side, where a grid would have to drop all but the number. Typing a
 * number scrolls to it instead of filtering, so the episodes around it —
 * the thing that tells you where you landed — stay on screen.
 */
function EpisodeList({
  total,
  episode,
  onEpisodeChange,
  stills,
  duration,
  watched,
  canMark,
  onToggleWatched,
}: {
  total: number;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  stills: Map<number, string>;
  duration: string | null;
  watched: Map<number, EpisodeState>;
  canMark: boolean;
  onToggleWatched: (episode: number) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = (n: number, behavior: ScrollBehavior) => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-episode="${n}"]`);
    if (!list || !row) return;
    list.scrollTo({
      top: row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2,
      behavior,
    });
  };

  // Opens on the episode that is loaded, not at the top — on a long show
  // those are hundreds of rows apart. Without animating, so it reads as
  // where the list already was.
  useEffect(() => {
    scrollTo(episode, "auto");
  }, [episode, total]);

  const jump = () => {
    const parsed = Number.parseInt(query.trim(), 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(1, parsed), total);
    onEpisodeChange(clamped);
    scrollTo(clamped, "smooth");
  };

  return (
    <>
      {total > 12 && (
        <div className="relative shrink-0 p-2">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
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
            className="h-8 w-full rounded-lg border border-border/60 bg-card/60 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      )}

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 pt-0 [scrollbar-width:thin]"
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <EpisodeRow
            key={n}
            n={n}
            still={stills.get(n)}
            duration={duration}
            current={n === episode}
            state={watched.get(n)}
            canMark={canMark}
            onOpen={() => onEpisodeChange(n)}
            onToggleWatched={() => onToggleWatched(n)}
            markLabel={t("detail.episodeMark")}
            label={t("detail.episodeNumber", { n })}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One episode row.
 *
 * The frame is a thumbnail here, not the background: at this width a
 * picture behind text is unreadable, and a good share of the provider's
 * stills 404 anyway. A missing or broken one leaves a numbered plate the
 * same size, so the column never develops holes.
 */
function EpisodeRow({
  n,
  still,
  duration,
  current,
  state,
  canMark,
  onOpen,
  onToggleWatched,
  markLabel,
  label,
}: {
  n: number;
  still: string | undefined;
  duration: string | null;
  current: boolean;
  state: EpisodeState | undefined;
  canMark: boolean;
  onOpen: () => void;
  onToggleWatched: () => void;
  markLabel: string;
  label: string;
}) {
  const [broken, setBroken] = useState(false);
  const art = still && !broken ? still : null;
  const done = state?.completed ?? false;

  return (
    <div
      data-episode={n}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-lg border p-1 pr-1.5 transition-colors duration-200",
        current
          ? "border-primary bg-primary/10"
          : done
            ? "border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/60"
            : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={current}
        title={label}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-secondary/60">
          {art ? (
            <img
              src={art}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center font-display text-xs tabular-nums text-muted-foreground">
              {n}
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "font-display text-xs leading-tight tabular-nums",
              current
                ? "text-primary"
                : done
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground",
            )}
          >
            {label}
          </span>
          {duration && (
            <span className="truncate text-[10px] leading-tight text-muted-foreground">
              {duration}
            </span>
          )}
        </span>
      </button>

      {canMark && (
        <button
          type="button"
          onClick={onToggleWatched}
          aria-pressed={done}
          aria-label={markLabel}
          title={markLabel}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-200 active:scale-90",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border/60 text-muted-foreground/50 hover:border-emerald-400 hover:text-emerald-500",
          )}
        >
          <CheckIcon className="size-3" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/**
 * The dubs.
 *
 * The star is separate from the row: picking a dub is for right now,
 * starring it is for every time you come back to this title — the player
 * opens on a starred dub ahead of its own ranking.
 */
function DubList({
  sources,
  currentSourceId,
  favouriteDub,
  onPickSource,
  onToggleFavourite,
  sourceLabel,
}: {
  sources: WatchSource[];
  currentSourceId: string;
  favouriteDub: string | null;
  onPickSource: (id: string) => void;
  onToggleFavourite: (title: string) => void;
  sourceLabel: (source: WatchSource) => string;
}) {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:thin]">
      {sources.map((source) => {
        const active = source.id === currentSourceId;
        const starred = favouriteDub === source.title;
        return (
          <div
            key={source.id}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors duration-200",
              active
                ? "border-primary bg-primary/10"
                : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
            )}
          >
            <button
              type="button"
              onClick={() => onPickSource(source.id)}
              aria-current={active}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs font-medium",
                  active ? "text-primary" : "text-foreground/85",
                )}
              >
                {sourceLabel(source)}
              </span>
              {active && <DrawnCheck key={currentSourceId} className="size-3.5 shrink-0 text-primary" />}
            </button>

            <button
              type="button"
              onClick={() => onToggleFavourite(source.title)}
              aria-pressed={starred}
              aria-label={t("watch.dubFavourite")}
              title={t("watch.dubFavourite")}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full transition-all duration-200 active:scale-90",
                starred
                  ? "text-amber-400"
                  : "text-muted-foreground/40 hover:text-amber-400",
              )}
            >
              <StarIcon className={cn("size-3.5", starred && "morph-pop fill-current")} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
