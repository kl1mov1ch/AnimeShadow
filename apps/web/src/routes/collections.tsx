import { COLLECTION_SORTS, COLLECTION_TAGS, type CollectionSort, type CollectionTag } from "@animeshadow/shared";
import { BarChart3Icon, LayersIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CollectionCard, TagChip } from "@/components/collections/collection-card";
import { PageHero } from "@/components/common/page-hero";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { useCollections, useMyCollectionsStats } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * Everyone's collections: the most read, the newest or the best rated,
 * narrowed by what they're for — and the way into writing one.
 */
export function Component() {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const [params, setParams] = useSearchParams();
  const sort = (COLLECTION_SORTS as readonly string[]).includes(params.get("sort") ?? "")
    ? (params.get("sort") as CollectionSort)
    : "popular";
  const tagParam = params.get("tag");
  const tag = (COLLECTION_TAGS as readonly string[]).includes(tagParam ?? "") ? (tagParam as CollectionTag) : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 300);

  const { data, isPending } = useCollections({ sort, tag, q: q || undefined, page, perPage: 18 });
  const { data: mine } = useMyCollectionsStats(authed);
  const limit = mine?.limit;
  const atLimit = limit?.max != null && limit.used >= limit.max;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4 sm:py-6">
      <PageHero icon={LayersIcon} eyebrow={t("collections.eyebrow")} title={t("collections.title")} lead={t("collections.lead")}>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {authed ? (
            <>
              <Link
                to={atLimit ? "/support" : "/collections/new"}
                className="btn-sheen inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
              >
                <PlusIcon className="size-4" />
                {atLimit ? t("collections.limitReached") : t("collections.create")}
              </Link>
              <Link
                to="/collections/stats"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <BarChart3Icon className="size-4" />
                {t("collections.myStats")}
              </Link>
              {limit && (
                <span className="text-xs text-muted-foreground">
                  {limit.max == null
                    ? t("collections.limitPro", { n: limit.used })
                    : t("collections.limitFree", { n: limit.used, max: limit.max })}
                </span>
              )}
            </>
          ) : (
            <Link
              to="/login"
              className="btn-sheen inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30"
            >
              {t("collections.signInToCreate")}
            </Link>
          )}
        </div>
      </PageHero>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg border border-primary/25 bg-primary/5 p-0.5">
            {COLLECTION_SORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ sort: s === "popular" ? null : s })}
                aria-pressed={sort === s}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
                )}
              >
                {t(`collections.sort.${s}` as "collections.sort.popular")}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                set({ q: e.target.value.trim() || null });
              }}
              placeholder={t("collections.search")}
              className="h-9 w-full rounded-lg border border-primary/25 bg-card/60 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => set({ tag: null })}
            aria-pressed={!tag}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
              !tag ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {t("collections.allTags")}
          </button>
          {COLLECTION_TAGS.map((tg) => (
            <TagChip key={tg} tag={tg} active={tag === tg} onClick={() => set({ tag: tag === tg ? null : tg })} />
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary/30 p-10 text-center text-sm text-muted-foreground">
          {t("collections.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
          <PaginationBar
            page={page}
            hasNextPage={data.meta.hasNextPage}
            totalPages={Math.max(1, Math.ceil(data.meta.total / data.meta.perPage))}
            buildHref={(p) => {
              const next = new URLSearchParams(params);
              if (p <= 1) next.delete("page");
              else next.set("page", String(p));
              return `/collections?${next.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
