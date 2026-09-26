import { COLLECTION_SORTS, COLLECTION_TAGS, type CollectionSort, type CollectionTag } from "@animeshadow/shared";
import { BarChart3Icon, DicesIcon, LayersIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  const [rolls, setRolls] = useState(0);
  const navigate = useNavigate();
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-4 sm:py-6">
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
          ) : null}
          {data && data.items.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const pick = data.items[Math.floor(Math.random() * data.items.length)]!;
                setRolls((r) => r + 1);
                window.setTimeout(() => navigate(`/collections/${pick.id}`, { viewTransition: true }), 450);
              }}
              className="group inline-flex h-10 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-4 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary"
            >
              <DicesIcon key={rolls} className={cn("size-4", rolls > 0 && "dice-roll")} />
              {t("collections.random")}
            </button>
          )}
          {!authed && (
            <Link
              to="/login"
              className="btn-sheen inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30"
            >
              {t("collections.signInToCreate")}
            </Link>
          )}
        </div>
      </PageHero>

      <div className="sticky top-16 z-30 flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/95 p-3 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="relative grid rounded-xl border border-border/60 bg-card/60 p-1"
            style={{ gridTemplateColumns: `repeat(${COLLECTION_SORTS.length}, minmax(0, 1fr))` }}
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 rounded-lg bg-primary shadow-md shadow-primary/30 transition-transform duration-300 ease-out"
              style={{
                width: `calc((100% - 0.5rem) / ${COLLECTION_SORTS.length})`,
                transform: `translateX(${COLLECTION_SORTS.indexOf(sort) * 100}%)`,
              }}
            />
            {COLLECTION_SORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ sort: s === "popular" ? null : s })}
                aria-pressed={sort === s}
                className={cn(
                  "relative z-10 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors",
                  sort === s ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`collections.sort.${s}` as "collections.sort.popular")}
              </button>
            ))}
          </div>
          <div className="group relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                set({ q: e.target.value.trim() || null });
              }}
              placeholder={t("collections.search")}
              className="h-10 w-full rounded-xl border border-border/60 bg-card/60 pl-9 pr-9 text-sm outline-none transition-colors focus:border-primary/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  set({ q: null });
                }}
                aria-label={t("common.clear")}
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            type="button"
            onClick={() => set({ tag: null })}
            aria-pressed={!tag}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              !tag ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {t("collections.allTags")}
          </button>
          {COLLECTION_TAGS.map((tg) => (
            <TagChip key={tg} tag={tg} active={tag === tg} onClick={() => set({ tag: tag === tg ? null : tg })} className="shrink-0 px-2.5 py-1" />
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={cn("h-80 rounded-2xl", i === 0 && "lg:col-span-2")} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary/30 p-10 text-center text-sm text-muted-foreground">
          {t("collections.empty")}
        </p>
      ) : (
        <>
          <div className="reveal-group grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((c, i) => {
              const top = page === 1 && !q && !tag;
              const featured = top && i === 0 && data.items.length >= 3;
              return (
                <CollectionCard
                  key={c.id}
                  collection={c}
                  featured={featured}
                  rank={top && sort !== "new" && i < 3 ? i + 1 : undefined}
                  className={cn("reveal", featured && "sm:col-span-2")}
                  style={{ "--i": i % 12 } as CSSProperties}
                />
              );
            })}
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
