import { COLLECTION_SORTS, COLLECTION_TAGS, type CollectionSort, type CollectionTag } from "@animeshadow/shared";
import {
  BarChart3Icon,
  DicesIcon,
  FlameIcon,
  type LucideIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CollectionCard } from "@/components/collections/collection-card";
import { PaginationBar } from "@/components/common/pagination-bar";
import { SIDE_ASIDE, SIDE_CARD, SideItem, SideSelect } from "@/components/common/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { useCollections, useMyCollectionsStats } from "@/lib/query";
import { cn } from "@/lib/utils";

const SORT_ICON: Record<CollectionSort, LucideIcon> = {
  popular: FlameIcon,
  new: SparklesIcon,
  top: StarIcon,
};

/**
 * Everyone's collections, laid out like "Мой список" and the catalogue: a
 * side panel as tall as the screen — making one, search, the order as a
 * list, the theme as a select — and the cards beside it.
 */
export function Component() {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = (COLLECTION_SORTS as readonly string[]).includes(params.get("sort") ?? "")
    ? (params.get("sort") as CollectionSort)
    : "popular";
  const tagParam = params.get("tag");
  const tag = (COLLECTION_TAGS as readonly string[]).includes(tagParam ?? "") ? (tagParam as CollectionTag) : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 300);
  const [rolls, setRolls] = useState(0);

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

  const tagLabel = (tg: CollectionTag) => t(`collections.tags.${tg}` as "collections.tags.cozy");
  const top = page === 1 && !q && !tag;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start xl:gap-6">
      <aside className={SIDE_ASIDE}>
        <div className={SIDE_CARD}>
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-display text-xl">{t("collections.eyebrow")}</h1>
            {data && <span className="text-xs tabular-nums text-muted-foreground">{data.meta.total}</span>}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("collections.lead")}</p>

          {authed ? (
            <div className="flex flex-col gap-1.5">
              <Link
                to={atLimit ? "/support" : "/collections/new"}
                className="btn-sheen inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.98]"
              >
                <PlusIcon className="size-4" />
                {atLimit ? t("collections.limitReached") : t("collections.create")}
              </Link>
              {limit && (
                <span className="text-center text-[11px] text-muted-foreground">
                  {limit.max == null
                    ? t("collections.limitPro", { n: limit.used })
                    : t("collections.limitFree", { n: limit.used, max: limit.max })}
                </span>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="btn-sheen inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              {t("collections.signInToCreate")}
            </Link>
          )}

          <div className="group relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                set({ q: e.target.value.trim() || null });
              }}
              placeholder={t("collections.search")}
              className="h-9 w-full rounded-lg border border-border/60 bg-background/60 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  set({ q: null });
                }}
                aria-label={t("common.clear")}
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <nav className="-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible">
            {COLLECTION_SORTS.map((s) => (
              <SideItem
                key={s}
                label={t(`collections.sort.${s}` as "collections.sort.popular")}
                icon={SORT_ICON[s]}
                active={sort === s}
                onClick={() => set({ sort: s === "popular" ? null : s })}
              />
            ))}
          </nav>
        </div>

        <div className={cn(SIDE_CARD, "lg:flex-1")}>
          <SideSelect
            label={t("collections.theme")}
            value={tag ?? null}
            anyLabel={t("collections.allTags")}
            options={COLLECTION_TAGS.map((tg) => ({ value: tg, label: tagLabel(tg) }))}
            onPick={(v) => set({ tag: v })}
          />
          <div className="flex flex-col gap-1">
            {data && data.items.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const pick = data.items[Math.floor(Math.random() * data.items.length)]!;
                  setRolls((r) => r + 1);
                  window.setTimeout(() => navigate(`/collections/${pick.id}`, { viewTransition: true }), 450);
                }}
                className="flex items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <DicesIcon key={rolls} className={cn("size-3.5", rolls > 0 && "dice-roll")} />
                {t("collections.random")}
              </button>
            )}
            {authed && (
              <Link
                to="/collections/stats"
                className="flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <BarChart3Icon className="size-3.5" />
                {t("collections.myStats")}
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{data?.meta.total ?? "…"}</span>
          </p>
          {tag && (
            <button
              type="button"
              onClick={() => set({ tag: null })}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/50 px-2 py-0.5 text-xs transition-colors hover:border-foreground/30"
            >
              {tagLabel(tag)}
              <XIcon className="size-3 text-muted-foreground" />
            </button>
          )}
          {q && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                set({ q: null });
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/50 px-2 py-0.5 text-xs transition-colors hover:border-foreground/30"
            >
              «{q}»
              <XIcon className="size-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={cn("h-80 rounded-2xl", i === 0 && "sm:col-span-2")} />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
            {t("collections.empty")}
          </p>
        ) : (
          <>
            <div className="reveal-group grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((c, i) => {
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
    </div>
  );
}
