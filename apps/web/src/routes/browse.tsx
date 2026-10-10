import type { AnimeSummary, Genre, SmartSearchResponse } from "@animeshadow/shared";
import {
  ArrowDownIcon,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ActiveFilterChips } from "@/components/anime/active-filter-chips";
import { BrowseFilters, BrowseSearch, type FilterPatch } from "@/components/anime/browse-filters";
import { AnimeGrid, AnimeGridSkeleton, type AnimeViewMode } from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState, NoResultsState } from "@/components/common/states";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
 * Top to bottom it reads the way people use it: what this is and how much
 * of it there is, a search box, one-tap lists (ongoing, top, films…), and
 * then the results with their filters. On a computer the filters stand
 * beside the results and scroll with a visible bar when the window is
 * short; on a phone or tablet they open as a sheet from the bottom with
 * the live count on its button. Every choice applies at once.
 */
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

  const browse = useBrowse(params, !isSearch);
  const total = browse.data?.meta.total;
  const filterCount = activeFilterCount(params);

  const filters = (
    <BrowseFilters params={params} genres={genres} onChange={(changes) => patch(changes)} onReset={resetFilters} />
  );

  const filterSheet = (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3.5 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card lg:hidden"
        >
          <SlidersHorizontalIcon className="size-4" />
          {t("browse.filters")}
          {filterCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
              {filterCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[88dvh] flex-col gap-0 rounded-t-2xl border-t border-border/60 bg-background p-0"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle>{t("browse.filters")}</SheetTitle>
          <SheetDescription className="sr-only">{t("browse.filtersHint")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <BrowseFilters
            params={params}
            genres={genres}
            onChange={(changes) => patch(changes)}
            onReset={resetFilters}
            heading={false}
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
              {total != null && !isSearch ? t("browse.showResults", { count: titlesCount(total) }) : t("browse.showResultsBare")}
            </button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );

  const chips = <ActiveFilterChips params={params} genres={genres} onChange={(changes) => patch(changes)} />;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 className="font-display text-2xl sm:text-3xl">{t("browse.pageTitle")}</h1>
          {total != null && !isSearch && (
            <p className="text-sm tabular-nums text-muted-foreground">{titlesCount(total)}</p>
          )}
        </div>
        <BrowseSearch params={params} onChange={(changes) => patch(changes)} />
        <PresetRow params={params} isSearch={isSearch} onChange={(changes) => patch(changes)} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border/60 lg:bg-card/30 lg:p-4 lg:[scrollbar-color:var(--border)_transparent] lg:[scrollbar-width:thin]">
          {filters}
        </aside>

        <div className="min-w-0">
          {isSearch ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-display text-xl">«{params.q}»</h2>
                {filterSheet}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
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
              filterSheet={filterSheet}
            />
          )}
        </div>
      </div>
    </div>
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
 * The results: a toolbar that stays under the header while the grid
 * scrolls (filters on a phone, what is applied, the order, the view), the
 * grid, and "show more" that keeps adding pages under the ones already on
 * screen — the pager is still there for jumping further.
 */
function CatalogResults({
  params,
  view,
  onView,
  onChange,
  buildHref,
  chips,
  filterSheet,
}: {
  params: ReturnType<typeof parseBrowseParams>;
  view: AnimeViewMode;
  onView: (view: string) => void;
  onChange: (patch: FilterPatch) => void;
  buildHref: (page: number) => string;
  chips: React.ReactNode;
  filterSheet: React.ReactNode;
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
  // Warm the page after the last one shown, so "next" and "load more" open at once.
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
      <div className="sticky top-16 z-20 -mx-4 flex flex-col gap-2 border-b border-border/40 bg-background/95 px-4 py-2.5 lg:mx-0 lg:rounded-xl lg:border lg:border-border/60 lg:px-3">
        <div className="flex items-center gap-2">
          {filterSheet}
          <Select value={params.orderBy ?? "popularity"} onValueChange={(value) => onChange({ orderBy: value })}>
            <SelectTrigger className="h-10 min-w-0 flex-1 sm:w-52 sm:flex-none" aria-label={t("browse.sortBy")}>
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
          <span className="ml-auto hidden text-sm tabular-nums text-muted-foreground sm:inline">
            {first.data ? null : <Loader2Icon className="size-4 animate-spin" />}
          </span>
          <button
            type="button"
            onClick={() => void random()}
            aria-label={t("browse.random")}
            title={t("browse.random")}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground active:scale-95"
          >
            <DicesIcon className={cn("size-[18px] transition-transform duration-500", rolling && "animate-spin")} />
          </button>
          <ViewSwitch view={view} onView={onView} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">{chips}</div>
      </div>

      {first.isError ? (
        <ErrorState onRetry={() => void first.refetch()} />
      ) : first.isPending ? (
        <AnimeGridSkeleton view={view} />
      ) : first.data.items.length === 0 ? (
        <NoResultsState />
      ) : (
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
              className="group mx-auto inline-flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-6 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card active:scale-[0.98]"
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
    <div role="radiogroup" className="hidden h-10 items-center gap-0.5 rounded-lg border border-border/70 bg-card/60 p-0.5 sm:flex">
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
