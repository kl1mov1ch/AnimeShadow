import type { LandingPage, LandingParams } from "@animeshadow/shared";
import { genreSlug, landingPath, parseLandingPath } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontalIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AnimeGrid, AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState } from "@/components/common/states";
import { apiRequest } from "@/lib/api";
import { useGenres } from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";

/** "1 265 тайтлов", "21 тайтл", "3 тайтла". */
function titlesCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "тайтл" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "тайтла" : "тайтлов";
  return `${n.toLocaleString("ru-RU")} ${word}`;
}

/** The same list in the catalogue, where it can be filtered and sorted. */
function catalogHref(params: LandingParams, genreId: number | undefined): string {
  switch (params.kind) {
    case "top":
      return "/browse?orderBy=score";
    case "popular":
      return "/browse?orderBy=popularity";
    case "ongoing":
      return "/browse?airing=AIRING";
    case "announced":
      return "/browse?airing=UPCOMING";
    case "movies":
      return "/browse?type=MOVIE";
    case "year":
    case "season":
      return params.year ? `/browse?year=${params.year}` : "/browse";
    case "genre":
      return genreId != null ? `/browse?genres=${genreId}` : "/browse";
    default:
      return "/browse";
  }
}

/**
 * A landing page — "Топ аниме", "Онгоинги", "Аниме осени 2026", "Аниме
 * 2025 года", "Аниме в жанре «Романтика»" — at a clean address of its own,
 * laid out like the catalogue: the name and how many there are, the
 * neighbouring lists as one row (it scrolls sideways on a phone instead of
 * filling half the screen), a way into the catalogue with these titles
 * already picked for filtering and sorting, and the grid. The list comes
 * from the same API the server uses to render this page for search
 * engines, so a visitor and a crawler see the same titles.
 */
export function Component() {
  const { pathname, search } = useLocation();
  const params = parseLandingPath(pathname, search);
  const page = params?.page ?? 1;
  const query = useQuery({
    queryKey: ["landing", pathname, page],
    enabled: params != null,
    queryFn: ({ signal }) => apiRequest<LandingPage>("/landing", { signal, query: { path: pathname, page } }),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
  const data = query.data;
  const { data: genres = [] } = useGenres();

  useDocumentHead(
    data
      ? {
          title: data.copy.title,
          description: data.copy.description,
          path: landingPath(data.params),
          image: data.items[0]?.imageLargeUrl ?? data.items[0]?.imageUrl ?? null,
        }
      : { title: "AnimeShadow" },
  );

  if (!params || query.isError) {
    return <ErrorState title="Страница не найдена" message="Загляните в каталог, топ аниме или онгоинги." />;
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const base = landingPath({ ...params, page: 1 });
  const genreId = params.kind === "genre" ? genres.find((g) => genreSlug(g.name) === params.genre)?.id : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-3">
        <nav aria-label="Навигация" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Главная
          </Link>
          <span aria-hidden>›</span>
          <Link to="/browse" className="hover:text-foreground">
            Каталог
          </Link>
        </nav>
        <div className="flex items-baseline justify-between gap-x-4">
          <h1 className="font-display text-xl leading-tight sm:text-3xl">{data?.copy.h1 ?? "…"}</h1>
          {data && <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">{titlesCount(data.total)}</p>}
        </div>
        {data && <p className="line-clamp-2 max-w-3xl text-sm text-muted-foreground sm:line-clamp-none">{data.copy.intro}</p>}
        {data && data.related.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {data.related.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-border/60 px-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
        <Link
          to={catalogHref(params, genreId)}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3.5 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card"
        >
          <SlidersHorizontalIcon className="size-4" />
          Фильтры и сортировка
        </Link>
      </header>

      {!data ? (
        <AnimeGridSkeleton count={18} />
      ) : data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
          Здесь пока пусто.
        </p>
      ) : (
        <>
          <div className={query.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
            <AnimeGrid items={data.items} priorityCount={6} view="grid" />
          </div>
          <PaginationBar
            page={page}
            hasNextPage={page < pages}
            totalPages={pages}
            buildHref={(p) => (p <= 1 ? base : `${base}?page=${p}`)}
          />
        </>
      )}
    </div>
  );
}
