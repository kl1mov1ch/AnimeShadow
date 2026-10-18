import { SlidersHorizontalIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AnimeGrid, AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { ErrorState } from "@/components/common/states";
import { useCuratedCollection } from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";

/**
 * One of the site's themed lists: what it is, its best titles (every one
 * of them playable here), the same list in the catalogue to dig further,
 * and a few other lists to move on to.
 */
export function Component() {
  const { slug = "" } = useParams();
  const { data, isPending, isError, refetch } = useCuratedCollection(slug);

  useDocumentHead(
    data
      ? {
          title: `${data.title} — подборка аниме | AnimeShadow`,
          description: data.pitch,
          path: `/collections/c/${data.slug}`,
          image: data.items[0]?.imageLargeUrl ?? data.items[0]?.imageUrl ?? null,
        }
      : { title: "Подборка — AnimeShadow" },
  );

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  const Icon = data ? CURATED_ICON[data.icon] : null;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-3">
        <nav aria-label="Навигация" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/collections" className="hover:text-foreground">
            Подборки
          </Link>
        </nav>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="flex min-w-0 items-center gap-2 font-display text-xl leading-tight sm:text-3xl">
            {Icon && <Icon className="size-5 shrink-0 text-muted-foreground sm:size-6" />}
            {data?.title ?? "…"}
          </h1>
          {data && <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">{titlesCount(data.total)}</p>}
        </div>
        {data && <p className="max-w-3xl text-sm text-muted-foreground">{data.pitch}</p>}
        {data && (
          <Link
            to={data.moreHref}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3.5 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-card"
          >
            <SlidersHorizontalIcon className="size-4" />
            Все в каталоге, с фильтрами
          </Link>
        )}
      </header>

      {isPending || !data ? <AnimeGridSkeleton count={18} /> : <AnimeGrid items={data.items} priorityCount={6} view="grid" />}

      {data && data.others.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border/50 pt-5">
          <h2 className="text-sm font-semibold">Другие подборки</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {data.others.map((other) => {
              const OtherIcon = CURATED_ICON[other.icon];
              return (
                <Link
                  key={other.slug}
                  to={`/collections/c/${other.slug}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <OtherIcon className="size-4" />
                  {other.title}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
