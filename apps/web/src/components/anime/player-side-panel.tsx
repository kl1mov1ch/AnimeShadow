import { isStudioName, studioSlug, type WatchSource } from "@animeshadow/shared";
import { Link } from "react-router-dom";
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
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DubLogo } from "@/components/anime/dub-logo";
import { DrawnCheck, MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { useDragScroll } from "@/lib/drag-scroll";
import { type EpisodeCatalog, type EpisodeInfo, formatClock } from "@/lib/episodes";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  episodeProgress,
  runtimeSeconds,
  type SavedEpisodeState,
} from "@/lib/episode-progress";

export type EpisodeState = SavedEpisodeState;

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
  fallbackPoster,
  currentEpisodes,
  watched,
  showProgress,
  canMark,
  onToggleWatched,
  sources,
  currentSourceId,
  favouriteDub,
  onPickSource,
  onToggleFavourite,
  sourceLabel,
  footer,
  className,
}: {
  /** How many episodes the list shows — the real released count. */
  total: number;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  catalog: EpisodeCatalog;
  /** The title-wide runtime, for episodes no provider measured. */
  fallbackDuration: string | null;
  fallbackPoster?: string | null;
  /** What the dub on screen can play; null when it doesn't say. */
  currentEpisodes: Set<number> | null;
  watched: Map<number, EpisodeState>;
  /** Draw the progress in `watched` (this device's too) even without an account. */
  showProgress?: boolean;
  canMark: boolean;
  onToggleWatched: (episode: number) => void;
  sources: WatchSource[];
  currentSourceId: string;
  favouriteDub: string | null;
  onPickSource: (id: string) => void;
  onToggleFavourite: (title: string) => void;
  /** Rendering a source's name is the player's business, not this panel's. */
  sourceLabel: (source: WatchSource) => string;
  /** What sits under the lists — the player's own switches. */
  footer?: React.ReactNode;
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
              tab === "episodes"
                ? "translate-x-0"
                : "translate-x-[calc(100%+0.125rem)]",
            )}
          />
          <PanelTab
            active={tab === "episodes"}
            onClick={() => setTab("episodes")}
            icon={ListVideoIcon}
            label={t("detail.sections.episodes")}
            count={total}
            hint={t("watch.tip.episodesTab", { n: total })}
          />
          <PanelTab
            active={tab === "dubs"}
            onClick={() => setTab("dubs")}
            icon={MicIcon}
            label={t("watch.dubs")}
            count={sources.length}
            hint={t("watch.tip.dubsTab", { n: sources.length })}
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
          fallbackPoster={fallbackPoster}
          currentEpisodes={currentEpisodes}
          watched={watched}
          showProgress={showProgress ?? canMark}
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
      {footer && (
        <div className="shrink-0 border-t border-border/60 p-1.5">{footer}</div>
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
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListVideoIcon;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 transition-transform duration-300",
          active && "scale-110",
        )}
      />
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
/** One row's height in px (h-11 row + 4px gap) — fixed, so the list can be
 *  windowed by arithmetic instead of measuring a thousand rows. */
const ROW = 48;
/** Rows drawn above and below what's on screen. */
const OVERSCAN = 8;

function EpisodeList({
  total,
  episode,
  onEpisodeChange,
  catalog,
  fallbackDuration,
  fallbackPoster,
  currentEpisodes,
  watched,
  showProgress,
  canMark,
  onToggleWatched,
}: {
  total: number;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  catalog: EpisodeCatalog;
  fallbackDuration: string | null;
  fallbackPoster?: string | null;
  currentEpisodes: Set<number> | null;
  watched: Map<number, EpisodeState>;
  showProgress: boolean;
  canMark: boolean;
  onToggleWatched: (episode: number) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragScroll<HTMLDivElement>();
  const setList = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el;
      drag(el);
    },
    [drag],
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);

  // Stable handlers for the memoised rows: a long show's list is a thousand
  // rows, and a new function on every render re-rendered all of them each
  // time an episode was picked.
  const openRef = useRef(onEpisodeChange);
  const toggleRef = useRef(onToggleWatched);
  openRef.current = onEpisodeChange;
  toggleRef.current = onToggleWatched;
  const open = useCallback((n: number) => openRef.current(n), []);
  const toggle = useCallback((n: number) => toggleRef.current(n), []);

  const scrollTo = useCallback((n: number, behavior: ScrollBehavior) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: (n - 1) * ROW - list.clientHeight / 2 + ROW / 2, behavior });
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    setHeight(list.clientHeight);
    const observer = new ResizeObserver(() => setHeight(list.clientHeight));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Opens on the episode that is loaded, not at the top — on a long show
  // those are hundreds of rows apart. Only when it's off screen: picking a
  // visible episode shouldn't yank the list under the pointer.
  // Decided from the scroll position already in state: reading it back
  // from the DOM right after a render forced a synchronous relayout of the
  // whole page.
  const viewRef = useRef({ scrollTop, height });
  viewRef.current = { scrollTop, height };
  useEffect(() => {
    const { scrollTop: top0, height: h } = viewRef.current;
    const top = (episode - 1) * ROW;
    if (top < top0 || top + ROW > top0 + h) scrollTo(episode, "auto");
  }, [episode, total, scrollTo]);

  const jump = () => {
    const parsed = Number.parseInt(query.trim(), 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(1, parsed), total);
    onEpisodeChange(clamped);
    scrollTo(clamped, "smooth");
  };

  // Only the rows on screen (and a few either side) exist in the DOM.
  const first = Math.max(1, Math.floor(scrollTop / ROW) + 1 - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  const rows: number[] = [];
  for (let n = first; n <= last; n++) rows.push(n);

  return (
    <>
      {showProgress && <SeriesProgress total={total} episode={episode} watched={watched} onOpen={(n) => { onEpisodeChange(n); scrollTo(n, "smooth"); }} />}
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
            title={t("watch.tip.episodeJump")}
            className="h-8 w-full rounded-lg border border-border/60 bg-card/60 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      )}

      <div
        ref={setList}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="relative min-h-0 flex-1 cursor-grab overflow-y-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative" style={{ height: total * ROW }}>
          {rows.map((n) => (
            <div
              key={n}
              className="absolute inset-x-0"
              style={{ top: (n - 1) * ROW, height: ROW - 4 }}
            >
              <EpisodeRow
                n={n}
                info={catalog.info.get(n)}
                fallbackDuration={fallbackDuration}
                fallbackPoster={fallbackPoster}
                current={n === episode}
                inDub={currentEpisodes == null || currentEpisodes.has(n)}
                state={showProgress ? watched.get(n) : undefined}
                canMark={canMark}
                onOpen={open}
                onToggleWatched={toggle}
              />
            </div>
          ))}
        </div>
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
const EpisodeRow = memo(function EpisodeRow({
  n,
  info,
  fallbackDuration,
  fallbackPoster,
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
  fallbackPoster?: string | null;
  current: boolean;
  inDub: boolean;
  state: EpisodeState | undefined;
  canMark: boolean;
  onOpen: (n: number) => void;
  onToggleWatched: (n: number) => void;
}) {
  const t = useT();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const still = [info?.thumb, ...(info?.thumbs ?? [])].find(
    (url): url is string => Boolean(url) && !failedImages.includes(url!),
  );
  const artwork =
    still ??
    (fallbackPoster && !failedImages.includes(fallbackPoster) ? fallbackPoster : null);
  const art = artwork ? imageSrc(artwork, 240) : null;
  const personalState = state;
  const saved = episodeProgress(
    personalState,
    true,
    info?.durationSeconds ?? runtimeSeconds(fallbackDuration),
  );
  const done = saved.completed;
  const numberLabel = t("detail.episodeNumber", { n });
  const length =
    info?.durationSeconds != null
      ? formatClock(info.durationSeconds)
      : fallbackDuration;
  const started = !done && saved.position > 0;
  const hint = [
    info?.title ? `${numberLabel} · ${info.title}` : numberLabel,
    current
      ? t("watch.tip.episodeCurrent")
      : done
        ? t("watch.episodeWatched")
        : started
          ? t("watch.tip.episodeStarted", { at: formatClock(saved.position) })
          : null,
    inDub ? null : t("watch.episodeNotInDub"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-episode={n}
      className={cn(
        "group relative isolate flex h-full items-center gap-2 overflow-hidden rounded-lg border p-1 pr-1.5 transition-colors duration-150 [&>button]:relative [&>button]:z-10",
        current
          ? "border-primary bg-card/50 shadow-sm"
          : done
            ? "border-primary/20 hover:border-primary/40"
            : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
        !inDub && !current && "opacity-45 hover:opacity-100",
      )}
    >
      {saved.fraction > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-primary/[0.04] to-primary/[0.12]"
          style={{ width: `${saved.fraction * 100}%` }}
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(n)}
        aria-current={current}
        title={hint}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-secondary/60">
          {art ? (
            <img
              src={art}
              alt={still ? `Кадр ${n}-й серии` : "Постер аниме"}
              loading="lazy"
              decoding="async"
              onError={() => artwork && setFailedImages((urls) => [...urls, artwork])}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center font-display text-xs tabular-nums text-muted-foreground">
              {n}
            </span>
          )}
          {art && (
            <span className="absolute bottom-1 left-0.5 rounded bg-black/70 px-1 font-display text-[9px] leading-tight tabular-nums text-white">
              {n}
            </span>
          )}
          {done ? (
            <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/45">
              <CheckIcon className="size-4 text-emerald-300 drop-shadow" strokeWidth={3} />
            </span>
          ) : null}
          {saved.fraction > 0 && (
            <span aria-hidden className="ep-progress absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
              <span
                className={cn("block h-full rounded-r-full", done ? "bg-emerald-400" : "ep-progress-fill bg-primary")}
                style={{ width: `${Math.max(4, saved.fraction * 100)}%` }}
              />
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
                <span className="tabular-nums text-muted-foreground">{n}.</span>{" "}
                {info.title}
              </>
            ) : (
              numberLabel
            )}
          </span>
          <span className="flex items-center gap-1 truncate text-[10px] leading-tight text-muted-foreground">
            {saved.position > 0 ? (
              <span className="tabular-nums text-primary">
                {formatClock(saved.position)}
                {length ? ` / ${length}` : ""}
              </span>
            ) : (
              <>
                {length && <span className="tabular-nums">{length}</span>}
                {info?.synopsis && length && <span aria-hidden>·</span>}
                {info?.synopsis && <span className="truncate">{info.synopsis}</span>}
              </>
            )}
          </span>
        </span>
      </button>

      <EpisodeInfoButton
        n={n}
        info={info}
        length={length}
        inDub={inDub}
        state={personalState}
      />

      {canMark && (
        <button
          type="button"
          onClick={() => onToggleWatched(n)}
          aria-pressed={done}
          aria-label={done ? t("watch.tip.episodeUnmark") : t("detail.episodeMark")}
          title={done ? t("watch.tip.episodeUnmark") : t("detail.episodeMark")}
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
});

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
          {info?.title && (
            <span className="text-[13px] font-semibold leading-snug">{info.title}</span>
          )}
          {info?.titleEn && (
            <span className="text-[11px] italic leading-snug text-muted-foreground">
              {info.titleEn}
            </span>
          )}
          {info?.synopsis && (
            <span className="line-clamp-6 text-[11px] font-normal leading-relaxed text-foreground/80">
              {info.synopsis}
            </span>
          )}
          <span className="mt-0.5 flex flex-col gap-1 text-[11px] font-normal text-muted-foreground">
            {length && <InfoLine icon={ClockIcon}>{length}</InfoLine>}
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
              <InfoLine icon={LayersIcon}>
                {t("watch.episodeDubs", { n: info.dubs })}
              </InfoLine>
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
  const drag = useDragScroll<HTMLDivElement>();
  return (
    <div
      ref={drag}
      className="flex min-h-0 flex-1 animate-in cursor-grab flex-col gap-1 overflow-y-auto p-2 fade-in-0 duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
              title={
                active
                  ? t("watch.tip.dubCurrent", { name: sourceLabel(source) })
                  : t("watch.tip.dubPick", { name: sourceLabel(source) })
              }
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <DubLogo name={source.title} active={active} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs font-medium",
                  active ? "text-primary" : "text-foreground/85",
                )}
              >
                {sourceLabel(source)}
              </span>
              {source.episodesCount != null && (
                <span
                  title={t("watch.tip.dubEpisodes", { n: source.episodesCount })}
                  className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                >
                  {source.episodesCount}
                </span>
              )}
              {active && (
                <DrawnCheck
                  key={currentSourceId}
                  className="size-3.5 shrink-0 text-primary"
                />
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
                <TooltipContent side="left" className="max-w-56">
                  {starred ? t("watch.dubFavouriteOn") : t("watch.tip.dubStar")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      })}
      {(() => {
        // The studio on screen, everything else it voiced — one tap away.
        const current = sources.find((source) => source.id === currentSourceId);
        const slug = current && isStudioName(current.title) ? studioSlug(current.title) : "";
        if (!current || !slug) return null;
        return (
          <Link
            to={/^hon-?kon/.test(slug) ? "/studio/hon-kon" : `/studios/${slug}`}
            className="mt-1 flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
          >
            <MicIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Всё аниме в озвучке {current.title}</span>
            <span aria-hidden>→</span>
          </Link>
        );
      })()}
    </div>
  );
}

/**
 * Where you are in the whole show, over the list: how many episodes are
 * watched, one segment per episode (a continuous bar past sixty), and the
 * episode you left half-way through — one tap back into it. Drawn from the
 * same map as the rows, so it moves while the episode plays.
 */
function SeriesProgress({
  total,
  episode,
  watched,
  onOpen,
}: {
  total: number;
  episode: number;
  watched: Map<number, EpisodeState>;
  onOpen: (n: number) => void;
}) {
  let done = 0;
  let resume: number | null = null;
  let resumeFraction = 0;
  for (const [n, state] of watched) {
    if (n < 1 || n > total) continue;
    if (state.completed) done += 1;
    else if (state.position > 30 && n !== episode && (resume == null || n > resume)) {
      resume = n;
      resumeFraction = state.duration ? Math.min(1, state.position / state.duration) : 0;
    }
  }
  if (done === 0 && resume == null && !watched.get(episode)?.position) return null;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const segments = total <= 60;
  const current = watched.get(episode);
  const currentFraction = current?.duration ? Math.min(1, current.position / current.duration) : 0;

  return (
    <div className="series-progress shrink-0 border-b border-border/60 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-foreground">Просмотрено</span>
        <span className="tabular-nums text-muted-foreground">
          {done} из {total}
        </span>
        <span className="ml-auto rounded-full bg-primary/12 px-1.5 py-0.5 font-display text-[10px] tabular-nums text-primary">
          {percent}%
        </span>
      </div>
      {segments ? (
        <div className="mt-1.5 flex h-1.5 gap-[2px]" aria-hidden>
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const state = watched.get(n);
            const fraction = state?.completed ? 1 : state?.duration ? Math.min(1, state.position / state.duration) : 0;
            return (
              <span key={n} className={cn("relative flex-1 overflow-hidden rounded-full bg-foreground/10", n === episode && "ring-1 ring-primary/70")}>
                {fraction > 0 && (
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-full", state?.completed ? "bg-emerald-400/90" : "bg-primary")}
                    style={{ width: `${fraction * 100}%` }}
                  />
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
      {resume != null ? (
        <button
          type="button"
          onClick={() => onOpen(resume)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg bg-primary/10 px-2 py-1.5 text-left text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <ClockIcon className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">Продолжить {resume}-ю серию</span>
          <span className="h-1 w-10 overflow-hidden rounded-full bg-primary/20">
            <span className="block h-full bg-primary" style={{ width: `${resumeFraction * 100}%` }} />
          </span>
        </button>
      ) : current && !current.completed && currentFraction > 0 ? (
        <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
          Серия {episode}: {formatClock(current.position)}
          {current.duration ? ` из ${formatClock(current.duration)}` : ""}
        </p>
      ) : null}
    </div>
  );
}
