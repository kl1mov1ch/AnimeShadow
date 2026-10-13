import type { AnimeSummary, Genre, SmartSearchResponse } from "@animeshadow/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClapperboardIcon,
  DicesIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  type LucideIcon,
  MonitorPlayIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilterBar } from "@/components/anime/filter-bar";
import { BrowseFilters, type FilterPatch } from "@/components/anime/browse-filters";
import { AnimeGrid, AnimeGridSkeleton, type AnimeViewMode } from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState, NoResultsState } from "@/components/common/states";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import { apiRequest } from "@/lib/api";
import { useI18n } from "@/i18n";
import { activeFilterCount, parseBrowseParams, SORT_VALUES } from "@/lib/browse-params";
import { type BrowseParams, useBrowse, useGenres, useSmartSearch } from "@/lib/query";
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

/** "7 902 тайтла" */
function titlesCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "тайтл"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "тайтла"
        : "тайтлов";
  return `${n.toLocaleString("ru-RU")} ${word}`;
}

/**
 * The catalogue.
 *
 * Top to bottom: the name and how much there is, a search box, one-tap
 * lists (ongoing, top, films…), a row with the filters and the order, and
 * the results. Nothing stays pinned over the posters while they scroll:
 * on a computer the filters stand beside the results; on a phone they open
 * as a sheet from the bottom, and once the row with their button has
 * scrolled away, a small "filters · back to top" pill comes back at the
 * bottom of the screen whenever the list is scrolled up — and keeps out
 * of the way while it is read down. Every choice applies at once.
 */
export function Component() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseBrowseParams(searchParams), [searchParams]);
  const isSearch = Boolean(params.q);
  const [view, setView] = useState<AnimeViewMode>(readStoredView);
  const [sheetOpen, setSheetOpen] = useState(false);

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
  // A search with filters (or another order) is a catalogue query: every
  // filter applies exactly, in SQL, and it pages. A bare search is the smart
  // one, in groups — the quick answer at once, the thorough one (characters,
  // studios, plot) put in its place when it lands.
  const searchWithFilters =
    isSearch && (activeFilterCount(params) > 0 || params.hasCustomPlayer === true || (params.orderBy ?? "popularity") !== "popularity");
  const quickSearch = useSmartSearch(params.q ?? "", isSearch && !searchWithFilters, true);
  const fullSearch = useSmartSearch(params.q ?? "", isSearch && !searchWithFilters, false);
  const search = fullSearch.data && fullSearch.data.query === params.q ? fullSearch : quickSearch;

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

  // Clears the filters but keeps the order and the search term.
  const resetFilters = useCallback(() => {
    const next = new URLSearchParams();
    for (const key of ["q", "orderBy", "sort"]) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const goToPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams);
      if (page <= 1) next.delete("page");
      else next.set("page", String(page));
      return `/browse?${next.toString()}`;
    },
    [searchParams],
  );

  const browse = useBrowse(params, !isSearch || searchWithFilters);
  const total = browse.data?.meta.total;
  const filterCount = activeFilterCount(params);

  // The pill at the bottom: only once the toolbar is off the top of the
  // screen, and only while the list is being scrolled back up.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarAbove, setToolbarAbove] = useState(false);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setToolbarAbove(entry != null && !entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const wide = useMediaQuery("(min-width: 1024px)");
  // Once the filter row has scrolled away, the filters ride along at the
  // bottom of the screen as one pill — on every screen, whichever way the
  // page is being scrolled.
  const pillShown = toolbarAbove && !sheetOpen;

  const sort = (
    <Select value={params.orderBy ?? "popularity"} onValueChange={(value) => patch({ orderBy: value })}>
      <SelectTrigger className="h-10 w-full min-w-0" aria-label={t("browse.sortBy")}>
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
  );


  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-x-4">
          <h1 className="font-display text-xl sm:text-3xl">{t("browse.pageTitle")}</h1>
          {total != null && (!isSearch || searchWithFilters) && (
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">{titlesCount(total)}</p>
          )}
        </div>
        <PresetRow params={params} isSearch={isSearch} onChange={(changes) => patch(changes)} />
      </header>

      <div className="flex flex-col gap-4">
        {/* The filters: a row of buttons, each opening its own choices. */}
        <FilterBar params={params} genres={genres} onChange={(changes) => patch(changes)} onReset={resetFilters} />

        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          {/* The row: filters (on a phone or tablet), the order, and on a
              wider screen "pick one at random" and grid or list. */}
          <div ref={toolbarRef} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="hidden h-10 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3.5 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card"
            >
              <SlidersHorizontalIcon className="size-4" />
              {t("browse.filters")}
              {filterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {filterCount}
                </span>
              )}
            </button>
            {isSearch && <h2 className="min-w-0 flex-1 truncate font-display text-lg">«{params.q}»</h2>}
            <div className={cn("min-w-0", isSearch ? "w-36 shrink-0 sm:w-48" : "flex-1 sm:w-56 sm:flex-none")}>{sort}</div>
            {!isSearch && <RandomButton params={params} />}
            <ViewSwitch view={view} onView={changeView} />
          </div>


          {isSearch && !searchWithFilters ? (
            <SearchResults
              query={search}
              params={params}
              genres={genres}
              view={view}
              onRetry={() => void search.refetch()}
            />
          ) : (
            <CatalogResults params={params} view={view} buildHref={goToPage} />
          )}
        </div>
      </div>

      {/* Filters on a phone: a sheet from the bottom, the order at its top
          and the live count on its button. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side={wide ? "right" : "bottom"}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn("flex flex-col gap-0 bg-background p-0", wide ? "w-[22rem] border-l border-border/60" : "max-h-[88dvh] rounded-t-2xl border-t border-border/60")}
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle>{t("browse.filters")}</SheetTitle>
            <SheetDescription className="sr-only">{t("browse.filtersHint")}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{t("browse.sortBy")}</span>
              {sort}
            </div>
            <BrowseFilters
              params={params}
              genres={genres}
              onChange={(changes) => patch(changes)}
              onReset={resetFilters}
              heading={false}
              compact
            />
          </div>
          <div className="flex gap-2 border-t border-border/60 bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {filterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-11 rounded-xl border border-border/70 px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("library.side.reset")}
              </button>
            )}
            <SheetClose asChild>
              <button type="button" className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
                {total != null && (!isSearch || searchWithFilters)
                  ? t("browse.showResults", { count: titlesCount(total) })
                  : t("browse.showResultsBare")}
              </button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      <div
        aria-hidden={!pillShown}
        className={cn(
          "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center rounded-full border border-border/70 bg-card/95 p-1 shadow-lg shadow-black/40 backdrop-blur transition-[opacity,transform] duration-300 ease-out",
          pillShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <button
          type="button"
          tabIndex={pillShown ? undefined : -1}
          onClick={() => setSheetOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium"
        >
          <SlidersHorizontalIcon className="size-4" />
          {t("browse.filters")}
          {filterCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
              {filterCount}
            </span>
          )}
        </button>
        <span aria-hidden className="h-5 w-px bg-border" />
        <button
          type="button"
          tabIndex={pillShown ? undefined : -1}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("browse.toTop")}
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** One title at random from what the filters leave. */
function RandomButton({ params }: { params: BrowseParams }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
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
    <button
      type="button"
      onClick={() => void random()}
      aria-label={t("browse.random")}
      title={t("browse.random")}
      className="hidden size-10 shrink-0 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground active:scale-95 sm:ml-auto sm:grid"
    >
      <DicesIcon className={cn("size-[18px]", rolling && "animate-spin")} />
    </button>
  );
}

/* ---------- one-tap lists ---------- */

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
    key: "movies",
    icon: ClapperboardIcon,
    patch: { type: "MOVIE" },
    active: (p) => p.type === "MOVIE",
  },
  {
    key: "short",
    icon: TimerIcon,
    patch: { episodesMin: "2", episodesMax: "13" },
    active: (p) => p.episodesMin === 2 && p.episodesMax === 13,
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

function PresetRow({
  params,
  isSearch,
  onChange,
}: {
  params: BrowseParams;
  isSearch: boolean;
  onChange: (patch: FilterPatch) => void;
}) {
  const { t } = useI18n();
  const any = PRESETS.some((p) => p.active(params));
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-200",
      active
        ? "border-foreground/25 bg-foreground/10 font-medium text-foreground"
        : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
    );
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        aria-pressed={!any && !isSearch}
        onClick={() => onChange(Object.assign({}, ...PRESETS.map((p) => undo(p.patch)), { q: null }))}
        className={chip(!any && !isSearch)}
      >
        <LayoutGridIcon className="size-4" />
        {t("browse.everything")}
      </button>
      {PRESETS.map(({ key, icon: Icon, patch, active }) => {
        const on = active(params);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? undo(patch) : patch)}
            className={chip(on)}
          >
            <Icon className={cn("size-4", on && "text-primary")} />
            {t(`browse.presets.${key}` as "browse.presets.airing")}
          </button>
        );
      })}
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
    // only place a genre filter can apply while a search term is active.
    if (selectedGenreNames.size > 0 && !a.genres.some((name) => selectedGenreNames.has(name))) return false;
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

  const selectedGenreNames = new Set(genres.filter((g) => params.genres?.includes(g.id)).map((g) => g.name));
  const groups = data.groups
    .map((g) => ({ ...g, items: applyClientFilters(g.items, params, selectedGenreNames) }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) return <NoResultsState query={params.q} />;

  return (
    <div className={cn("flex flex-col gap-10 transition-opacity", isFetching && "opacity-70")}>
      {data.detectedGenres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("search.detectedAs", { genres: "" })}
          {data.detectedGenres.map((g) => (
            <span key={g} className="rounded-md border border-border/70 bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-foreground">
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
            {isFetching && index === 0 && <Loader2Icon className="ml-2 inline size-3.5 animate-spin text-muted-foreground" />}
          </h2>
          <AnimeGrid items={group.items} priorityCount={index === 0 ? 6 : 0} view={view} />
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("common.results", { count: groups.reduce((n, g) => n + g.items.length, 0) })}
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

/**
 * The results: the grid, and "show more" that keeps adding pages under the
 * ones already on screen — the pager is still there for jumping further.
 */
function CatalogResults({
  params,
  view,
  buildHref,
}: {
  params: ReturnType<typeof parseBrowseParams>;
  view: AnimeViewMode;
  buildHref: (page: number) => string;
}) {
  const { t } = useI18n();
  const first = useBrowse(params);
  const [extra, setExtra] = useState(0);

  // A new set of filters starts from its first page again.
  const signature = JSON.stringify({ ...params, page: undefined });
  useEffect(() => setExtra(0), [signature]);

  const total = first.data?.meta.total ?? 0;
  const perPage = first.data?.meta.perPage ?? params.perPage;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const pages = Array.from({ length: extra }, (_, i) => params.page + i + 1).filter((n) => n <= lastPage);
  // Warm the page after the last one shown, so "next" and "load more" open at once.
  const nextPage = params.page + pages.length + 1;
  useBrowse({ ...params, page: nextPage }, Boolean(first.data) && !first.isPlaceholderData && nextPage <= lastPage);

  if (first.isError) return <ErrorState onRetry={() => void first.refetch()} />;
  if (first.isPending) return <AnimeGridSkeleton view={view} />;
  if (first.data.items.length === 0) return <NoResultsState />;

  return (
    <div
      className={cn("flex flex-col gap-6 transition-opacity duration-300", first.isPlaceholderData && "opacity-60")}
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
          className="group mx-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-6 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card active:scale-[0.98] sm:w-auto"
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
  );
}

/** One more page under the ones already shown. */
function MorePage({ params, page, view }: { params: BrowseParams; page: number; view: AnimeViewMode }) {
  const { data, isPending } = useBrowse({ ...params, page });
  if (isPending || !data) return <AnimeGridSkeleton view={view} />;
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <AnimeGrid items={data.items} view={view} />
    </div>
  );
}

/** Grid or wide cards. */
function ViewSwitch({ view, onView }: { view: AnimeViewMode; onView: (view: string) => void }) {
  const { t } = useI18n();
  const options = [
    { value: "grid", icon: LayoutGridIcon, label: t("library.viewGrid") },
    { value: "list", icon: ListIcon, label: t("library.viewList") },
  ] as const;
  return (
    <div role="radiogroup" className="hidden h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-card/60 p-0.5 sm:flex">
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
            "grid size-8 place-items-center rounded-md transition-colors",
            view === value ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
