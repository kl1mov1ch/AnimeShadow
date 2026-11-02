import {
  COLLECTION_SORTS,
  COLLECTION_TAGS,
  type CollectionSort,
  type CollectionTag,
} from "@animeshadow/shared";
import {
  BarChart3Icon,
  BookmarkIcon,
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
import { CuratedCard, DailyCurated } from "@/components/collections/curated-card";
import { PaginationBar } from "@/components/common/pagination-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import {
  useCollections,
  useCuratedCollections,
  useMyCollectionsStats,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { openGlobalSearch } from "@/lib/search-events";
import { Button } from "@/components/ui/button";

const ANY_TAG = "__any";

/** "1 подборка", "3 подборки", "12 подборок". */
function collectionsCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "подборка"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "подборки"
        : "подборок";
  return `${n.toLocaleString("ru-RU")} ${word}`;
}

const SORT_ICON: Record<CollectionSort, LucideIcon> = {
  popular: FlameIcon,
  new: SparklesIcon,
  top: StarIcon,
};

/**
 * Collections: first the site's own themed lists — the one of the day, wide,
 * then all of them as cards (each a rule over the catalogue, so always full
 * and always playable) — and under them the viewers' own collections, with
 * their search, order and theme. The viewers' part used to be the whole
 * page, and with a handful of them that left nothing much to look at.
 */
export function Component() {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = (COLLECTION_SORTS as readonly string[]).includes(
    params.get("sort") ?? "",
  )
    ? (params.get("sort") as CollectionSort)
    : "popular";
  const tagParam = params.get("tag");
  const tag = (COLLECTION_TAGS as readonly string[]).includes(tagParam ?? "")
    ? (tagParam as CollectionTag)
    : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = (params.get("q") ?? "").trim();
  const [rolls, setRolls] = useState(0);

  const saved = authed && params.get("scope") === "saved";
  const { data, isPending } = useCollections({
    sort,
    tag,
    q: q || undefined,
    page,
    perPage: 18,
    ...(saved ? { scope: "saved" as const } : {}),
  });
  const curated = useCuratedCollections();
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
    // A filter changes the list in place; turning a page still starts at the top.
    setParams(next, { replace: true, preventScrollReset: !("page" in patch) });
  };

  const tagLabel = (tg: CollectionTag) =>
    t(`collections.tags.${tg}` as "collections.tags.cozy");
  const top = page === 1 && !q && !tag;

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-200",
      active
        ? "border-foreground/25 bg-foreground/10 font-medium text-foreground"
        : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl sm:text-3xl">
              {t("collections.eyebrow")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("collections.lead")}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            {authed ? (
              <Link
                to={atLimit ? "/support" : "/collections/new"}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <PlusIcon className="size-4" />
                {atLimit ? t("collections.limitReached") : t("collections.create")}
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("collections.signInToCreate")}
              </Link>
            )}
            {authed && limit && (
              <span className="text-[11px] text-muted-foreground">
                {limit.max == null
                  ? t("collections.limitPro", { n: limit.used })
                  : t("collections.limitFree", { n: limit.used, max: limit.max })}
              </span>
            )}
          </div>
        </div>
      </header>

      {page === 1 && !q && !tag && !saved && (
        <CuratedHub data={curated.data} pending={curated.isPending} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg sm:text-xl">
          {t("collections.fromViewers")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start gap-2 bg-card/60 sm:w-auto"
            onClick={() => openGlobalSearch({ mode: "collections", query: q })}
          >
            <SearchIcon data-icon="inline-start" />
            Найти подборку
            <kbd className="ml-4 hidden text-[10px] text-muted-foreground sm:inline">
              Ctrl + K
            </kbd>
          </Button>
          {q && (
            <span className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-border/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="truncate">Поиск: «{q}»</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Сбросить поиск подборок"
                onClick={() => set({ q: null })}
              >
                <XIcon />
              </Button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {authed && (
              <button
                type="button"
                aria-pressed={saved}
                onClick={() => set({ scope: saved ? null : "saved" })}
                className={chip(saved)}
              >
                <BookmarkIcon
                  className={cn("size-4", saved && "fill-current text-primary")}
                />
                Избранное
              </button>
            )}
            {COLLECTION_SORTS.map((s) => {
              const Icon = SORT_ICON[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => set({ sort: s === "popular" ? null : s })}
                  className={chip(sort === s)}
                >
                  <Icon className={cn("size-4", sort === s && "text-primary")} />
                  {t(`collections.sort.${s}` as "collections.sort.popular")}
                </button>
              );
            })}
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
              <Select
                value={tag ?? ANY_TAG}
                onValueChange={(v) => set({ tag: v === ANY_TAG ? null : v })}
              >
                <SelectTrigger
                  className="h-9 w-full"
                  aria-label={t("collections.theme")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_TAG}>{t("collections.allTags")}</SelectItem>
                  {COLLECTION_TAGS.map((tg) => (
                    <SelectItem key={tg} value={tg}>
                      {tagLabel(tg)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && data.items.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const pick =
                    data.items[Math.floor(Math.random() * data.items.length)]!;
                  setRolls((r) => r + 1);
                  window.setTimeout(
                    () => navigate(`/collections/${pick.id}`, { viewTransition: true }),
                    450,
                  );
                }}
                aria-label={t("collections.random")}
                title={t("collections.random")}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <DicesIcon
                  key={rolls}
                  className={cn("size-4", rolls > 0 && "dice-roll")}
                />
              </button>
            )}
            {authed && (
              <Link
                to="/collections/stats"
                aria-label={t("collections.myStats")}
                title={t("collections.myStats")}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <BarChart3Icon className="size-4" />
              </Link>
            )}
          </div>
        </div>
        {(data || tag || q) && (
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">
              {data ? collectionsCount(data.meta.total) : "…"}
            </span>
            {q && <> · «{q}»</>}
            {tag && <> · {tagLabel(tag)}</>}
          </p>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton
                key={i}
                className={cn("h-80 rounded-2xl", i === 0 && "sm:col-span-2")}
              />
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

/** The site's themed lists: the one of the day, then all of them. */
function CuratedHub({
  data,
  pending,
}: {
  data: ReturnType<typeof useCuratedCollections>["data"];
  pending: boolean;
}) {
  const t = useT();
  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!data || data.items.length === 0) return null;
  const daily = data.items.find((c) => c.slug === data.daily);
  return (
    <div className="flex flex-col gap-4">
      {daily && <DailyCurated collection={daily} />}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg sm:text-xl">{t("collections.themed")}</h2>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((c) => (
            <CuratedCard key={c.slug} collection={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
