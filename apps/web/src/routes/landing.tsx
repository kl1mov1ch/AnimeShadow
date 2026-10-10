import type { LandingPage } from "@animeshadow/shared";
import { landingPath, parseLandingPath } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { CompassIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AnimeGrid, AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { ErrorState } from "@/components/common/states";
import { apiRequest } from "@/lib/api";
import { useDocumentHead } from "@/lib/seo";

/**
 * A landing page — "Топ аниме", "Онгоинги", "Аниме осени 2026", "Аниме
 * 2025 года", "Аниме в жанре «Романтика»" — at a clean address of its own.
 * The list comes from the same API the server uses to render this page for
 * search engines, so a visitor and a crawler see the same titles.
 */
export function Component() {
  const { pathname, search } = useLocation();
  const params = parseLandingPath(pathname, search);
  const page = params?.page ?? 1;
  const query = useQuery({
    queryKey: ["landing", pathname, page],
    enabled: params != null,
    queryFn: ({ signal }) =>
      apiRequest<LandingPage>("/landing", { signal, query: { path: pathname, page } }),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
  const data = query.data;

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

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5 sm:p-7">
        <nav aria-label="Навигация" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Главная
          </Link>
          <span>›</span>
          <Link to="/browse" className="hover:text-foreground">
            Каталог
          </Link>
        </nav>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{data?.copy.h1 ?? "…"}</h1>
        {data && <p className="max-w-3xl text-sm text-muted-foreground">{data.copy.intro}</p>}
        {data && data.related.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.related.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 px-2.5 py-1 text-xs transition-colors hover:border-foreground/30"
              >
                <CompassIcon className="size-3 text-muted-foreground" />
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {!data ? (
        <AnimeGridSkeleton count={18} />
      ) : data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
          Здесь пока пусто.
        </p>
      ) : (
        <>
          <p className="-mb-3 text-xs text-muted-foreground">
            {data.total.toLocaleString("ru-RU")} тайтлов{pages > 1 ? ` · страница ${page} из ${pages}` : ""}
          </p>
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
