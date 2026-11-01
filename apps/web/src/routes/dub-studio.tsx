import { ArrowLeftIcon, MicVocalIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { DubLogo } from "@/components/anime/dub-logo";
import { AnimeGrid } from "@/components/anime/anime-grid";
import { AnimeCardSkeleton } from "@/components/anime/anime-card";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState } from "@/components/common/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { imageSrc } from "@/lib/format";
import {
  type DubStudioSort,
  type DubStudioStatus,
  type DubStudioType,
  useDubStudio,
} from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: Array<[DubStudioStatus, string]> = [
  ["all", "Все"],
  ["airing", "Онгоинги"],
  ["finished", "Вышедшие"],
  ["upcoming", "Анонсы"],
];
const TYPES: Array<[DubStudioType, string]> = [
  ["all", "Любой формат"],
  ["TV", "Сериалы"],
  ["MOVIE", "Фильмы"],
  ["OVA", "OVA"],
  ["ONA", "ONA"],
  ["SPECIAL", "Спешлы"],
];
const SORTS: Array<[DubStudioSort, string]> = [
  ["popular", "Популярные"],
  ["score", "По рейтингу"],
  ["new", "Новые"],
  ["title", "По алфавиту"],
];
const pick = <T extends string>(
  value: string | null,
  options: Array<[T, string]>,
  fallback: T,
): T => (options.some(([key]) => key === value) ? (value as T) : fallback);

/**
 * One dub studio's catalogue: every title the site can play in its voices.
 *
 * The filters live in the address (?q=&status=&type=&sort=&page=), so a
 * filtered view can be shared, survives a reload, and each studio's first
 * page is a plain address a search engine can index on its own.
 */
export function Component() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const status = pick(params.get("status"), STATUSES, "all");
  const type = pick(params.get("type"), TYPES, "all");
  const sort = pick(params.get("sort"), SORTS, "popular");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search, 350).trim();

  const set = (patch: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (
            value == null ||
            value === "" ||
            value === "all" ||
            (key === "sort" && value === "popular")
          )
            next.delete(key);
          else next.set(key, value);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  useEffect(() => {
    if (q !== (params.get("q") ?? "")) set({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, isPending, isError, isFetching, refetch, error } = useDubStudio(slug, {
    q,
    sort,
    status,
    type,
    page,
  });
  const studio = data?.studio;
  const name = studio?.name ?? slug;

  useDocumentHead({
    title: `Аниме в озвучке ${name} — смотреть онлайн | AnimeShadow`,
    description: `Все аниме в озвучке ${name}${studio ? ` — ${studio.count} тайтлов` : ""}: онгоинги, фильмы и сериалы с русской озвучкой студии ${name}. Смотрите онлайн бесплатно на AnimeShadow.`,
    path: `/studios/${slug}`,
    image: studio?.posters[0],
    noindex:
      page > 1 ||
      Boolean(q) ||
      status !== "all" ||
      type !== "all" ||
      sort !== "popular",
  });

  if (/^hon-?kon/.test(slug)) return <Navigate to="/studio/hon-kon" replace />;
  const notFound = (error as { status?: number } | null)?.status === 404;

  const filtered = Boolean(q) || status !== "all" || type !== "all";
  const backdrop = studio?.posters ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* The studio: its mark over a blur of its best-known posters. */}
      <header className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-5 sm:p-7">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 flex opacity-40 blur-2xl saturate-150"
        >
          {backdrop.map((poster) => (
            <img
              key={poster}
              src={imageSrc(poster, 240)}
              alt=""
              decoding="async"
              className="h-full min-w-0 flex-1 object-cover"
            />
          ))}
        </div>
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-background/95 via-background/80 to-background/40"
        />
        <Link
          to="/studios"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Все студии
        </Link>
        <div className="flex items-center gap-4">
          <DubLogo
            name={name}
            className="size-16 rounded-2xl text-base shadow-xl sm:size-20 sm:text-lg"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MicVocalIcon className="size-3.5" />
              Студия озвучки
            </p>
            <h1 className="truncate font-display text-2xl leading-tight sm:text-4xl">
              {name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {studio ? `${studio.count} аниме в озвучке студии` : " "}
            </p>
          </div>
        </div>
      </header>

      {/* Search and filters. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Поиск по аниме студии</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Найти в озвучке ${name}`}
              className="h-10 w-full rounded-xl border border-border/60 bg-card/60 pl-9 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Очистить"
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </label>
          <FilterSelect
            label="Формат"
            value={type}
            options={TYPES}
            onChange={(value) => set({ type: value })}
          />
          <FilterSelect
            label="Сортировка"
            value={sort}
            options={SORTS}
            onChange={(value) => set({ sort: value })}
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUSES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => set({ status: key })}
              aria-pressed={status === key}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3.5 text-xs font-medium transition-colors",
                status === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
          {data && (
            <span className="ml-auto shrink-0 self-center pl-2 text-xs tabular-nums text-muted-foreground">
              {isFetching ? "Ищем…" : `Найдено: ${data.total}`}
            </span>
          )}
        </div>
      </div>

      {notFound ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-display text-xl">Такой студии озвучки нет</p>
          <Link to="/studios" className="text-sm text-primary hover:underline">
            Все студии
          </Link>
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-5 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <AnimeCardSkeleton key={i} />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-display text-lg">Ничего не нашлось</p>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                set({ q: null, status: null, type: null });
              }}
              className="text-sm text-primary hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <>
          <AnimeGrid
            items={data.items}
            priorityCount={6}
            className={cn("transition-opacity", isFetching && "opacity-60")}
          />
          <PaginationBar
            page={data.page}
            totalPages={data.pages}
            hasNextPage={data.page < data.pages}
            buildHref={(n) => {
              const next = new URLSearchParams(params);
              if (n > 1) next.set("page", String(n));
              else next.delete("page");
              const query = next.toString();
              return `/studios/${slug}${query ? `?${query}` : ""}`;
            }}
          />
        </>
      )}
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0 flex-1 sm:max-w-52">
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {options.map(([key, text]) => (
              <SelectItem key={key} value={key}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
