import type { AnimeSummary, SmartSearchResponse } from "@animeshadow/shared";
import { LayoutGridIcon, ListIcon, Loader2Icon, SlidersHorizontalIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BrowseFilters,
  type FilterPatch,
} from "@/components/anime/browse-filters";
import {
  AnimeGrid,
  AnimeGridSkeleton,
  type AnimeViewMode,
} from "@/components/anime/anime-grid";
import { PageHeader } from "@/components/common/page-header";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState, NoResultsState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import { hasActiveFilters, parseBrowseParams } from "@/lib/browse-params";
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
  const browse = useBrowse(params, !isSearch);
  const search = useSmartSearch(params.q ?? "", isSearch);

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
      <PageHeader
        title={isSearch ? `«${params.q}»` : t("browse.title")}
        description={isSearch ? t("search.groupTitle") : t("browse.subtitle")}
        actions={
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontalIcon data-icon="inline-start" />
                {t("browse.filters")}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[20rem] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t("browse.filters")}</SheetTitle>
                <SheetDescription>{t("browse.filtersHint")}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-8">{filters}</div>
            </SheetContent>
          </Sheet>
        }
      />

      <div className="flex gap-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20">{filters}</div>
        </aside>

        <div className="min-w-0 flex-1">
          {isSearch ? (
            <SearchResults
              query={search}
              params={params}
              view={view}
              onRetry={() => void search.refetch()}
            />
          ) : browse.isError ? (
            <ErrorState onRetry={() => void browse.refetch()} />
          ) : browse.isPending ? (
            <AnimeGridSkeleton view={view} />
          ) : browse.data.items.length === 0 ? (
            <NoResultsState />
          ) : (
            <div
              className={cn(
                "flex flex-col gap-8 transition-opacity",
                browse.isPlaceholderData && "opacity-60",
              )}
              aria-busy={browse.isPlaceholderData}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t("common.results", {
                    count: browse.data.meta.total.toLocaleString(),
                  })}
                </p>
                <ToggleGroup
                  type="single"
                  value={view}
                  onValueChange={changeView}
                  variant="outline"
                  className="h-8 [&>*]:h-8 [&>*]:w-8"
                >
                  <ToggleGroupItem value="grid" aria-label={t("library.viewGrid")}>
                    <LayoutGridIcon className="size-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="list" aria-label={t("library.viewList")}>
                    <ListIcon className="size-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <AnimeGrid items={browse.data.items} priorityCount={6} view={view} />
              <PaginationBar
                page={params.page}
                hasNextPage={browse.data.meta.hasNextPage}
                totalPages={Math.max(
                  1,
                  Math.ceil(browse.data.meta.total / browse.data.meta.perPage),
                )}
                buildHref={goToPage}
              />
            </div>
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
): AnimeSummary[] {
  return items.filter((a) => {
    if (params.type && a.type !== params.type) return false;
    if (params.airing && a.airing !== params.airing) return false;
    if (params.year && a.year !== params.year) return false;
    if (params.minScore && (a.score ?? 0) < params.minScore) return false;
    if (params.hasPlayer && a.hasPlayer !== true) return false;
    return true;
  });
}

function SearchResults({
  query,
  params,
  view,
  onRetry,
}: {
  query: ReturnType<typeof useSmartSearch>;
  params: BrowseParams;
  view: AnimeViewMode;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const { data, isPending, isFetching, isError } = query;

  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isPending || !data) return <AnimeGridSkeleton count={12} view={view} />;

  const groups = data.groups
    .map((g) => ({ ...g, items: applyClientFilters(g.items, params) }))
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
            <Badge key={g} variant="secondary" className="font-normal">
              {g}
            </Badge>
          ))}
        </div>
      )}

      {groups.map((group, index) => (
        <section key={`${group.reason}-${index}`} className="flex flex-col gap-4">
          <h2 className="text-lg font-bold tracking-tight">
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
