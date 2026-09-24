import type { AnimeSummary, Genre, SmartSearchResponse } from "@animeshadow/shared";
import {
  ArrowDownIcon,
  ClapperboardIcon,
  DicesIcon,
  FlameIcon,
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
  type FilterPatch,
} from "@/components/anime/browse-filters";
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

  return (
    <div className="flex flex-col gap-6">
      <CatalogHeader
        title={isSearch ? `«${params.q}»` : t("browse.title")}
        description={isSearch ? t("search.groupTitle") : t("browse.subtitle")}
        genreCount={genres.length}
        actions={
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="btn-sheen inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground active:scale-95 lg:hidden"
              >
                <SlidersHorizontalIcon className="size-4" />
                {t("browse.filters")}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[22rem] overflow-y-auto border-primary/30 bg-background">
              <SheetHeader>
                <SheetTitle className="font-display">{t("browse.filters")}</SheetTitle>
                <SheetDescription>{t("browse.filtersHint")}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-8">{filters}</div>
            </SheetContent>
          </Sheet>
        }
      />

      <ActiveFilterChips params={params} genres={genres} onChange={(changes) => patch(changes)} />

      <div className="flex gap-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-4 [scrollbar-width:thin]">
            {filters}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {isSearch ? (
            <SearchResults
              query={search}
              params={params}
              genres={genres}
              view={view}
              onRetry={() => void search.refetch()}
            />
          ) : (
            <CatalogResults
              params={params}
              view={view}
              onView={changeView}
              onChange={(changes) => patch(changes)}
              buildHref={goToPage}
            />
          )}
        </div>
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
  icon: typeof FlameIcon;
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
}: {
  params: ReturnType<typeof parseBrowseParams>;
  view: AnimeViewMode;
  onView: (view: string) => void;
  onChange: (patch: FilterPatch) => void;
  buildHref: (page: number) => string;
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
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map(({ key, icon: Icon, patch, active }) => {
          const on = active(params);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? undo(patch) : patch)}
              className={cn(
                "btn-sheen inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
                on
                  ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "border-primary/25 bg-primary/10 text-primary hover:-translate-y-0.5 hover:border-primary",
              )}
            >
              <Icon className="size-3.5" />
              {t(`browse.presets.${key}` as "browse.presets.airing")}
            </button>
          );
        })}
      </div>

      {/* Stays under the header while the grid scrolls, so the count, the
          order and the view are always one reach away. */}
      <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-line-soft)] bg-background/85 px-2.5 py-2 shadow-sm backdrop-blur-md">
        <p className="mr-auto text-xs text-muted-foreground">
          {first.data ? (
            <span className="tabular-nums">
              {t("browse.shown", { shown: shown.toLocaleString(), total: total.toLocaleString() })}
            </span>
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )}
        </p>
        <Select value={params.orderBy ?? "popularity"} onValueChange={(value) => onChange({ orderBy: value })}>
          <SelectTrigger className="h-8 w-44 rounded-lg border-primary/25 bg-primary/5 text-xs">
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
              className="btn-sheen grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-all hover:bg-primary hover:text-primary-foreground active:scale-90"
            >
              <DicesIcon className={cn("size-4 transition-transform duration-500", rolling && "animate-spin")} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("browse.random")}</TooltipContent>
        </Tooltip>
        <ViewSwitch view={view} onView={onView} />
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
              className="btn-sheen group mx-auto inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/25 active:scale-95"
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

/**
 * The top of the catalogue: its name on the site's accent surface, with
 * how big the thing being filtered is. It replaces the stock page header,
 * which was the one block on the page that looked like a default.
 */
function CatalogHeader({
  title,
  description,
  genreCount,
  actions,
}: {
  title: string;
  description: string;
  genreCount: number;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header className="relative overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] px-5 py-6 backdrop-blur-sm sm:px-7 sm:py-8">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 120% at 100% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[10rem] leading-none text-primary/[0.07]"
      >
        影
      </span>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          {genreCount > 0 && (
            <p className="text-xs font-medium text-primary">
              {t("browse.headerGenres", { count: genreCount })}
            </p>
          )}
        </div>
        {actions}
      </div>
    </header>
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
    <div className="relative flex rounded-lg border border-primary/25 bg-primary/5 p-0.5">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 w-8 rounded-md bg-primary shadow-md shadow-primary/30 transition-transform duration-300 ease-out",
          view === "list" ? "translate-x-8" : "translate-x-0",
        )}
      />
      {options.map(({ value, icon: Icon, label }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onView(value)}
              aria-pressed={view === value}
              aria-label={label}
              className={cn(
                "relative z-10 grid size-8 place-items-center rounded-md transition-colors duration-200",
                view === value ? "text-primary-foreground" : "text-muted-foreground hover:text-primary",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
