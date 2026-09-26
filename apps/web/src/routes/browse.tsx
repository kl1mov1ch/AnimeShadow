import type { AnimeSummary, Genre, SmartSearchResponse } from "@animeshadow/shared";
import {
  ArrowDownIcon,
  ClapperboardIcon,
  DicesIcon,
  CompassIcon,
  type LucideIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  MonitorPlayIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ActiveFilterChips } from "@/components/anime/active-filter-chips";
import {
  BrowseFilters,
  BrowseSearch,
  type FilterPatch,
} from "@/components/anime/browse-filters";
import { SIDE_ASIDE, SIDE_CARD, SideCollapse, SideItem } from "@/components/common/side-panel";
import {
  AnimeGrid,
  AnimeGridSkeleton,
  type AnimeViewMode,
} from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState, NoResultsState } from "@/components/common/states";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/i18n";
import { hasActiveFilters, parseBrowseParams, SORT_VALUES } from "@/lib/browse-params";
import {
  type BrowseParams,
  useBrowse,
  useGenres,
  useSmartSearch,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const VIEW_KEY = "animeshadow.browse.view.v1";

function readStoredView(): AnimeViewMode {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function Component() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseBrowseParams(searchParams), [searchParams]);
  const isSearch = Boolean(params.q);
  const [view, setView] = useState<AnimeViewMode>(readStoredView);

  const changeView = (next: string) => {
    if (next !== "grid" && next !== "list") return;
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const { data: genres = [] } = useGenres();
  const search = useSmartSearch(params.q ?? "", isSearch, false);

  const patch = useCallback(
    (changes: FilterPatch, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (opts.resetPage !== false) next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const reset = useCallback(() => setSearchParams({}), [setSearchParams]);

  const goToPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams);
      if (page <= 1) next.delete("page");
      else next.set("page", String(page));
      return `/browse?${next.toString()}`;
    },
    [searchParams],
  );

  const filters = (
    <BrowseFilters
      params={params}
      genres={genres}
      onChange={(changes) => patch(changes)}
      onReset={reset}
      showReset={hasActiveFilters(params)}
    />
  );
  const total = useBrowse(params, !isSearch).data?.meta.total;
  const activePreset = PRESETS.find((p) => p.active(params));
  const anyPreset = Boolean(activePreset);

  const mobileFilters = (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 text-sm font-medium transition-colors hover:border-foreground/30 lg:hidden"
        >
          <SlidersHorizontalIcon className="size-4" />
          {t("browse.filters")}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[22rem] overflow-y-auto bg-background">
        <SheetHeader>
          <SheetTitle className="font-display">{t("browse.filters")}</SheetTitle>
          <SheetDescription>{t("browse.filtersHint")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">{filters}</div>
      </SheetContent>
    </Sheet>
  );
  const chips = <ActiveFilterChips params={params} genres={genres} onChange={(changes) => patch(changes)} />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start xl:gap-6">
      {/* The side panel: the catalogue's name and size, search, quick
          lists, and — on a wide screen — every filter, as tall as the screen. */}
      <aside className={SIDE_ASIDE}>
        <div className={SIDE_CARD}>
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-display text-xl">{t("browse.title")}</h1>
            {total != null && <span className="text-xs tabular-nums text-muted-foreground">{total.toLocaleString("ru-RU")}</span>}
          </div>
          <BrowseSearch params={params} onChange={(changes) => patch(changes)} />
          <SideCollapse
            label={t("browse.listLabel")}
            icon={ListIcon}
            summary={activePreset ? t(`browse.presets.${activePreset.key}` as "browse.presets.airing") : t("browse.everything")}
          >
          <nav aria-label={t("browse.title")} className="flex flex-col gap-0.5">
            <SideItem
              label={t("browse.everything")}
              icon={CompassIcon}
              active={!anyPreset && !isSearch}
              onClick={() => patch(Object.assign({}, ...PRESETS.map((p) => undo(p.patch)), { q: null }))}
            />
            {PRESETS.map(({ key, icon, patch: presetPatch, active }) => {
              const on = active(params);
              return (
                <SideItem
                  key={key}
                  label={t(`browse.presets.${key}` as "browse.presets.airing")}
                  icon={icon}
                  active={on}
                  onClick={() => patch(on ? undo(presetPatch) : presetPatch)}
                />
              );
            })}
          </nav>
          </SideCollapse>
        </div>
        <div className={cn(SIDE_CARD, "hidden lg:flex lg:flex-1")}>{filters}</div>
      </aside>

      <div className="min-w-0">
        {isSearch ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-display text-xl">«{params.q}»</h2>
              {chips}
              {mobileFilters}
            </div>
            <SearchResults
              query={search}
              params={params}
              genres={genres}
              view={view}
              onRetry={() => void search.refetch()}
            />
          </div>
        ) : (
          <CatalogResults
            params={params}
            view={view}
            onView={changeView}
            onChange={(changes) => patch(changes)}
            buildHref={goToPage}
            chips={chips}
            mobileFilters={mobileFilters}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- smart search results ---------- */

function applyClientFilters(
  items: AnimeSummary[],
  params: BrowseParams,
  selectedGenreNames: Set<string>,
): AnimeSummary[] {
  return items.filter((a) => {
    if (params.type && a.type !== params.type) return false;
    if (params.airing && a.airing !== params.airing) return false;
    if (params.year && a.year !== params.year) return false;
    if (params.minScore && (a.score ?? 0) < params.minScore) return false;
    if (params.hasPlayer && a.hasPlayer !== true) return false;
    if (params.hasCustomPlayer && !a.hasCustomPlayer) return false;
    // Smart search has no server-side genre filter of its own — this is the
    // only place a genre filter can actually apply while a search term is
    // active, and it was missing entirely (genre picks silently did nothing
    // whenever combined with a search).
    if (
      selectedGenreNames.size > 0 &&
      !a.genres.some((name) => selectedGenreNames.has(name))
    )
      return false;
    return true;
  });
}

function SearchResults({
  query,
  params,
  genres,
  view,
  onRetry,
}: {
  query: ReturnType<typeof useSmartSearch>;
  params: BrowseParams;
  genres: Genre[];
  view: AnimeViewMode;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const { data, isPending, isFetching, isError } = query;

  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isPending || !data) return <AnimeGridSkeleton count={12} view={view} />;

  const selectedGenreNames = new Set(
    genres.filter((g) => params.genres?.includes(g.id)).map((g) => g.name),
  );
  const groups = data.groups
    .map((g) => ({
      ...g,
      items: applyClientFilters(g.items, params, selectedGenreNames),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) return <NoResultsState query={params.q} />;

  return (
    <div
      className={cn(
        "flex flex-col gap-10 transition-opacity",
        isFetching && "opacity-70",
      )}
    >
      {data.detectedGenres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("search.detectedAs", { genres: "" })}
          {data.detectedGenres.map((g) => (
            <span
              key={g}
              className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {groups.map((group, index) => (
        <section key={`${group.reason}-${index}`} className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-tight">
            <span aria-hidden className="h-4 w-1 rounded-full bg-primary" />
            {groupTitle(group.reason, group.label, t)}
            {isFetching && index === 0 && (
              <Loader2Icon className="ml-2 inline size-3.5 animate-spin text-muted-foreground" />
            )}
          </h2>
          <AnimeGrid items={group.items} priorityCount={index === 0 ? 6 : 0} view={view} />
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("common.results", {
          count: groups.reduce((n, g) => n + g.items.length, 0),
        })}
        {" · "}
        {t("search.smartSearch")}
      </p>
    </div>
  );
}

function groupTitle(
  reason: SmartSearchResponse["groups"][number]["reason"],
  label: string | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "title":
      return t("search.groupTitle");
    case "character":
      return t("search.groupCharacter", { name: label ?? "" });
    case "mood":
      return t("search.groupMood");
    case "synopsis":
      return t("search.groupSynopsis");
    default:
      return "";
  }
}

/* ---------- the catalogue itself ---------- */

interface Preset {
  key: string;
  icon: LucideIcon;
  patch: FilterPatch;
  active: (p: BrowseParams) => boolean;
}

/** One tap for the things people most often come to a catalogue for. */
const PRESETS: Preset[] = [
  {
    key: "airing",
    icon: RadioIcon,
    patch: { airing: "AIRING", orderBy: "popularity" },
    active: (p) => p.airing === "AIRING",
  },
  {
    key: "top",
    icon: TrophyIcon,
    patch: { orderBy: "score" },
    active: (p) => p.orderBy === "score",
  },
  {
    key: "fresh",
    icon: SparklesIcon,
    patch: { orderBy: "start_date" },
    active: (p) => p.orderBy === "start_date",
  },
  {
    key: "short",
    icon: TimerIcon,
    patch: { episodesMin: "2", episodesMax: "13" },
    active: (p) => p.episodesMin === 2 && p.episodesMax === 13,
  },
  {
    key: "movies",
    icon: ClapperboardIcon,
    patch: { type: "MOVIE" },
    active: (p) => p.type === "MOVIE",
  },
  {
    key: "own",
    icon: MonitorPlayIcon,
    patch: { hasCustomPlayer: "1" },
    active: (p) => p.hasCustomPlayer === true,
  },
];

/** The keys a preset sets, so tapping an active one can take it back off. */
function undo(patch: FilterPatch): FilterPatch {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, null]));
}

/**
 * The plain catalogue: presets, a toolbar that stays in reach while you
 * scroll, the grid, and "show more" that keeps adding pages under the ones
 * already on screen (the pager is still there for jumping further).
 */
function CatalogResults({
  params,
  view,
  onView,
  onChange,
  buildHref,
  chips,
  mobileFilters,
}: {
  params: ReturnType<typeof parseBrowseParams>;
  view: AnimeViewMode;
  onView: (view: string) => void;
  onChange: (patch: FilterPatch) => void;
  buildHref: (page: number) => string;
  chips: React.ReactNode;
  mobileFilters: React.ReactNode;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const first = useBrowse(params);
  const [extra, setExtra] = useState(0);
  const [rolling, setRolling] = useState(false);

  // A new set of filters starts from its first page again.
  const signature = JSON.stringify({ ...params, page: undefined });
  useEffect(() => setExtra(0), [signature]);

  const total = first.data?.meta.total ?? 0;
  const perPage = first.data?.meta.perPage ?? params.perPage;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const pages = Array.from({ length: extra }, (_, i) => params.page + i + 1).filter((n) => n <= lastPage);
  const shown = Math.min(total, (params.page - 1) * perPage + (1 + pages.length) * perPage);
  // Warm the page after the last one shown: the first request for any page
  // goes all the way upstream, so "next" and "load more" were the slow clicks.
  const nextPage = params.page + pages.length + 1;
  useBrowse({ ...params, page: nextPage }, Boolean(first.data) && !first.isPlaceholderData && nextPage <= lastPage);

  const random = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const pick = await apiRequest<{ slug: string }>("/anime/random-from", {
        query: {
          ...params,
          page: undefined,
          genres: params.genres?.join(","),
          excludeGenres: params.excludeGenres?.join(","),
        },
      });
      navigate(`/anime/${pick.slug}`, { viewTransition: true });
    } catch {
      toast.error(t("browse.randomNone"));
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Stays under the header while the grid scrolls: the count, what is
          applied, the order and the view are always one reach away. */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/95 px-2.5 py-2 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {first.data ? (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{shown.toLocaleString("ru-RU")}</span> / {total.toLocaleString("ru-RU")}
            </span>
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )}
        </p>
        {chips}
        <div className="ml-auto flex items-center gap-2">
          {mobileFilters}
          <Select value={params.orderBy ?? "popularity"} onValueChange={(value) => onChange({ orderBy: value })}>
            <SelectTrigger className="h-9! w-40 rounded-lg bg-card/50 text-sm sm:w-44" aria-label={t("browse.sortBy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`sort.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void random()}
                aria-label={t("browse.random")}
                className="grid size-9 place-items-center rounded-lg border border-border/60 bg-card/50 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground active:scale-90"
              >
                <DicesIcon className={cn("size-4 transition-transform duration-500", rolling && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("browse.random")}</TooltipContent>
          </Tooltip>
          <ViewSwitch view={view} onView={onView} />
        </div>
      </div>

      {first.isError ? (
        <ErrorState onRetry={() => void first.refetch()} />
      ) : first.isPending ? (
        <AnimeGridSkeleton view={view} />
      ) : first.data.items.length === 0 ? (
        <NoResultsState />
      ) : (
        <div
          className={cn("flex flex-col gap-6 transition-opacity", first.isPlaceholderData && "opacity-60")}
          aria-busy={first.isPlaceholderData}
        >
          <AnimeGrid items={first.data.items} priorityCount={6} view={view} />
          {pages.map((page) => (
            <MorePage key={page} params={params} page={page} view={view} />
          ))}
          {params.page + pages.length < lastPage && (
            <button
              type="button"
              onClick={() => setExtra((n) => n + 1)}
              className="group mx-auto inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/30 active:scale-95"
            >
              <ArrowDownIcon className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" />
              {t("browse.loadMore")}
            </button>
          )}
          <PaginationBar
            page={params.page + pages.length}
            hasNextPage={params.page + pages.length < lastPage}
            totalPages={lastPage}
            buildHref={buildHref}
          />
        </div>
      )}
    </div>
  );
}

/** One more page under the ones already shown. */
function MorePage({
  params,
  page,
  view,
}: {
  params: ReturnType<typeof parseBrowseParams>;
  page: number;
  view: AnimeViewMode;
}) {
  const { data, isPending } = useBrowse({ ...params, page });
  if (isPending || !data) return <AnimeGridSkeleton view={view} />;
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <AnimeGrid items={data.items} view={view} />
    </div>
  );
}

/** Grid or wide cards — the site's segmented control, not a stock toggle. */
function ViewSwitch({ view, onView }: { view: AnimeViewMode; onView: (view: string) => void }) {
  const { t } = useI18n();
  const options = [
    { value: "grid", icon: LayoutGridIcon, label: t("library.viewGrid") },
    { value: "list", icon: ListIcon, label: t("library.viewList") },
  ] as const;
  return (
    <div role="radiogroup" className="hidden h-9 items-center sm:flex gap-0.5 rounded-lg border border-border/60 bg-card/50 p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          aria-label={label}
          title={label}
          onClick={() => onView(value)}
          className={cn(
            "grid size-7 place-items-center rounded-md transition-colors",
            view === value ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
