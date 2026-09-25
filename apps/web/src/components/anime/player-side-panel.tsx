import type { WatchSource } from "@animeshadow/shared";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  LayersIcon,
  ListVideoIcon,
  MicIcon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DrawnCheck, MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { type EpisodeCatalog, type EpisodeInfo, formatClock } from "@/lib/episodes";
import { cn } from "@/lib/utils";

export type EpisodeState = { completed: boolean; position: number };

/**
 * Everything you change while watching, in one column beside the picture.
 *
 * Episodes and dubs used to live in two separate places — a rail in its own
 * section below the player and a row of cards under the control bar — which
 * put the two things you actually reach for mid-episode the furthest from
 * the video. Here they share one panel the height of the player, and moving
 * between them is a tab, not a scroll.
 *
 * Only one list is ever on screen and it is the one that scrolls: the panel
 * itself never changes size, so opening a 1200-episode show moves nothing
 * else on the page.
 */
export function PlayerSidePanel({
  total,
  episode,
  onEpisodeChange,
  catalog,
  fallbackDuration,
  currentEpisodes,
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
  /** How many episodes the list shows — the real released count. */
  total: number;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  catalog: EpisodeCatalog;
  /** The title-wide runtime, for episodes no provider measured. */
  fallbackDuration: string | null;
  /** What the dub on screen can play; null when it doesn't say. */
  currentEpisodes: Set<number> | null;
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
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-card/92",
        className,
      )}
    >
      {hasEpisodes && hasDubs && (
        <div className="relative flex shrink-0 gap-0.5 border-b border-border/60 p-1">
          {/* One highlight that slides between the two tabs, rather than
              two backgrounds that swap — the movement is what says the
              panel changed and not the page. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-1 w-[calc(50%-0.3125rem)] rounded-lg bg-primary/15 transition-transform duration-300 ease-out",
              tab === "episodes" ? "translate-x-0" : "translate-x-[calc(100%+0.125rem)]",
            )}
          />
          <PanelTab
            active={tab === "episodes"}
            onClick={() => setTab("episodes")}
            icon={ListVideoIcon}
            label={t("detail.sections.episodes")}
            count={total}
          />
          <PanelTab
            active={tab === "dubs"}
            onClick={() => setTab("dubs")}
            icon={MicIcon}
            label={t("watch.dubs")}
            count={sources.length}
          />
        </div>
      )}

      {tab === "episodes" && hasEpisodes ? (
        <EpisodeList
          key="episodes"
          total={total}
          episode={episode}
          onEpisodeChange={onEpisodeChange}
          catalog={catalog}
          fallbackDuration={fallbackDuration}
          currentEpisodes={currentEpisodes}
          watched={watched}
          canMark={canMark}
          onToggleWatched={onToggleWatched}
        />
      ) : (
        <DubList
          key="dubs"
          canFavourite={canMark}
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
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListVideoIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("size-3.5 transition-transform duration-300", active && "scale-110")} />
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

/**
 * The episodes, one per row.
 *
 * A row rather than a tile: at this width a row fits the still, the
 * episode's own name and its length side by side, where a grid would have
 * to drop all but the number. Typing a number scrolls to it instead of
 * filtering, so the episodes around it — the thing that tells you where
 * you landed — stay on screen.
 */
function EpisodeList({
  total,
  episode,
  onEpisodeChange,
  catalog,
  fallbackDuration,
  currentEpisodes,
  watched,
  canMark,
  onToggleWatched,
}: {
  total: number;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  catalog: EpisodeCatalog;
  fallbackDuration: string | null;
  currentEpisodes: Set<number> | null;
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
            aria-label={t("detail.episodeSearch")}
            className="h-8 w-full rounded-lg border border-border/60 bg-card/60 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      )}

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 animate-in flex-col gap-1 overflow-y-auto p-2 pt-0 fade-in-0 duration-300 [scrollbar-width:thin]"
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <EpisodeRow
            key={n}
            n={n}
            info={catalog.info.get(n)}
            fallbackDuration={fallbackDuration}
            current={n === episode}
            inDub={currentEpisodes == null || currentEpisodes.has(n)}
            state={watched.get(n)}
            canMark={canMark}
            onOpen={() => onEpisodeChange(n)}
            onToggleWatched={() => onToggleWatched(n)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One episode row.
 *
 * The still is a thumbnail, not a background: at this width a picture
 * behind text is unreadable. A missing or broken one leaves a numbered
 * plate the same size, so the column never develops holes.
 *
 * An episode the dub on screen doesn't have stays in the list — another
 * dub does — but dimmed, and clicking it still works: the player switches
 * to a source that carries it.
 */
function EpisodeRow({
  n,
  info,
  fallbackDuration,
  current,
  inDub,
  state,
  canMark,
  onOpen,
  onToggleWatched,
}: {
  n: number;
  info: EpisodeInfo | undefined;
  fallbackDuration: string | null;
  current: boolean;
  inDub: boolean;
  state: EpisodeState | undefined;
  canMark: boolean;
  onOpen: () => void;
  onToggleWatched: () => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const art = info?.thumb && !broken ? info.thumb : null;
  const done = state?.completed ?? false;
  const numberLabel = t("detail.episodeNumber", { n });
  const length =
    info?.durationSeconds != null ? formatClock(info.durationSeconds) : fallbackDuration;

  return (
    <div
      data-episode={n}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-lg border p-1 pr-1.5 transition-all duration-200",
        current
          ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
          : done
            ? "border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/60"
            : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
        !inDub && !current && "opacity-45 hover:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={current}
        title={info?.title ?? numberLabel}
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
              className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <span className="grid size-full place-items-center font-display text-xs tabular-nums text-muted-foreground">
              {n}
            </span>
          )}
          {art && (
            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 font-display text-[9px] leading-tight tabular-nums text-white">
              {n}
            </span>
          )}
          {/* Started but not finished — how far in they got. */}
          {state && !done && state.position > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/40">
              <span className="block h-full w-1/3 bg-primary" />
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "truncate text-xs font-medium leading-tight",
              current
                ? "text-primary"
                : done
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground",
            )}
          >
            {info?.title ? (
              <>
                <span className="tabular-nums text-muted-foreground">{n}.</span> {info.title}
              </>
            ) : (
              numberLabel
            )}
          </span>
          <span className="flex items-center gap-1 truncate text-[10px] leading-tight text-muted-foreground">
            {length && <span className="tabular-nums">{length}</span>}
            {info?.synopsis && length && <span aria-hidden>·</span>}
            {info?.synopsis && <span className="truncate">{info.synopsis}</span>}
          </span>
        </span>
      </button>

      <EpisodeInfoButton n={n} info={info} length={length} inDub={inDub} state={state} />

      {canMark && (
        <button
          type="button"
          onClick={onToggleWatched}
          aria-pressed={done}
          aria-label={t("detail.episodeMark")}
          title={t("detail.episodeMark")}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-200 active:scale-90",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border/60 text-muted-foreground/50 hover:border-emerald-400 hover:text-emerald-500",
          )}
        >
          <MorphIcon on={done} off={PlusIcon} onIcon={CheckIcon} className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * The (i) on each episode: everything any provider told us about it.
 *
 * Nobody publishes episode synopses — not Kodik, not AniLibria, not the
 * catalogues — so this carries what does exist: the episode's own name in
 * both languages, its real length, where the opening is, how many dubs have
 * it, and whether you have seen it. The (i) turns into the cross that
 * closes it, the same as every other hint on the site.
 */
function EpisodeInfoButton({
  n,
  info,
  length,
  inDub,
  state,
}: {
  n: number;
  info: EpisodeInfo | undefined;
  length: string | null;
  inDub: boolean;
  state: EpisodeState | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const done = state?.completed ?? false;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t("detail.episodeInfo")}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-200",
            open ? "text-primary" : "text-muted-foreground/50 hover:text-foreground",
          )}
        >
          <MorphIcon on={open} off={InfoIcon} onIcon={XIcon} className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-72 text-left">
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-[11px] uppercase tracking-wide text-primary">
            {t("detail.episodeNumber", { n })}
          </span>
          {info?.title && <span className="text-[13px] font-semibold leading-snug">{info.title}</span>}
          {info?.titleEn && (
            <span className="text-[11px] italic leading-snug text-muted-foreground">{info.titleEn}</span>
          )}
          {info?.synopsis && (
            <span className="line-clamp-6 text-[11px] font-normal leading-relaxed text-foreground/80">
              {info.synopsis}
            </span>
          )}
          <span className="mt-0.5 flex flex-col gap-1 text-[11px] font-normal text-muted-foreground">
            {length && (
              <InfoLine icon={ClockIcon}>{length}</InfoLine>
            )}
            {info?.airdate && (
              <InfoLine icon={CalendarIcon}>
                {new Date(info.airdate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </InfoLine>
            )}
            {info?.opening && (
              <InfoLine icon={MusicIcon}>
                {t("watch.episodeOpening", {
                  from: formatClock(info.opening.start),
                  to: formatClock(info.opening.stop),
                })}
              </InfoLine>
            )}
            {info && info.dubs > 0 && (
              <InfoLine icon={LayersIcon}>{t("watch.episodeDubs", { n: info.dubs })}</InfoLine>
            )}
            {!inDub && <InfoLine icon={MicIcon}>{t("watch.episodeNotInDub")}</InfoLine>}
            {done && (
              <InfoLine icon={CheckIcon} className="text-emerald-500">
                {t("watch.episodeWatched")}
              </InfoLine>
            )}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function InfoLine({
  icon: Icon,
  className,
  children,
}: {
  icon: typeof ClockIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Icon className="size-3 shrink-0" />
      <span className="tabular-nums">{children}</span>
    </span>
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
  canFavourite,
  sources,
  currentSourceId,
  favouriteDub,
  onPickSource,
  onToggleFavourite,
  sourceLabel,
}: {
  /** Favourites are remembered for an account — signed out, there is none. */
  canFavourite: boolean;
  sources: WatchSource[];
  currentSourceId: string;
  favouriteDub: string | null;
  onPickSource: (id: string) => void;
  onToggleFavourite: (title: string) => void;
  sourceLabel: (source: WatchSource) => string;
}) {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 animate-in flex-col gap-1 overflow-y-auto p-2 fade-in-0 duration-300 [scrollbar-width:thin]">
      {sources.map((source) => {
        const active = source.id === currentSourceId;
        const starred = favouriteDub === source.title;
        return (
          <div
            key={source.id}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 transition-all duration-200",
              active
                ? "border-primary bg-primary/10"
                : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
            )}
          >
            <button
              type="button"
              onClick={() => onPickSource(source.id)}
              aria-current={active}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <MicIcon
                className={cn(
                  "size-3.5 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground/60",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs font-medium",
                  active ? "text-primary" : "text-foreground/85",
                )}
              >
                {sourceLabel(source)}
              </span>
              {source.episodesCount != null && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {source.episodesCount}
                </span>
              )}
              {active && (
                <DrawnCheck key={currentSourceId} className="size-3.5 shrink-0 text-primary" />
              )}
            </button>

            {canFavourite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggleFavourite(source.title)}
                  aria-pressed={starred}
                  aria-label={t("watch.dubFavourite")}
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full transition-all duration-200 active:scale-90",
                    starred
                      ? "text-amber-400"
                      : "text-muted-foreground/40 hover:text-amber-400",
                  )}
                >
                  <StarIcon
                    key={String(starred)}
                    className={cn("size-3.5", starred && "morph-pop fill-current")}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {starred ? t("watch.dubFavouriteOn") : t("watch.dubFavourite")}
              </TooltipContent>
            </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}
