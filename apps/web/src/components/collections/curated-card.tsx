import type { CuratedCollection } from "@animeshadow/shared";
import { CompassIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * One of the site's themed lists, as a card: three posters fanned out, the
 * name, one line on what it is and how many titles are in it.
 */
export function CuratedCard({ collection, className }: { collection: CuratedCollection; className?: string }) {
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const covers = collection.covers.slice(0, 3);
  return (
    <Link
      to={`/collections/c/${collection.slug}`}
      viewTransition
      className={cn(
        "group flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-3 transition-colors duration-200 hover:border-foreground/20 hover:bg-card",
        className,
      )}
    >
      <div className="relative flex h-36 items-end justify-center overflow-hidden rounded-xl bg-foreground/[0.04] pt-4">
        {covers.map((anime, i) => (
          <img
            key={anime.id}
            src={imageSrc(anime.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
            className={cn(
              "absolute bottom-[-0.75rem] aspect-[2/3] w-[5.25rem] rounded-lg object-cover shadow-lg shadow-black/40 ring-1 ring-black/20 transition-transform duration-300 ease-out",
              i === 0 && "z-10 group-hover:-translate-y-1",
              i === 1 && "-translate-x-14 -rotate-6 scale-90 opacity-90 group-hover:-translate-x-16",
              i === 2 && "translate-x-14 rotate-6 scale-90 opacity-90 group-hover:translate-x-16",
            )}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{collection.title}</span>
        </span>
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{collection.pitch}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/80">{titlesCount(collection.total)}</span>
      </div>
    </Link>
  );
}

/**
 * The collection of the day, wide: its name and pitch beside a row of its
 * posters (a strip that scrolls sideways on a phone).
 */
export function DailyCurated({ collection }: { collection: CuratedCollection }) {
  const labels = useLabels();
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  return (
    <section className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex min-w-0 flex-col gap-2 lg:w-72 lg:shrink-0">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">Подборка дня</span>
        <h2 className="flex items-center gap-2 font-display text-xl leading-tight sm:text-2xl">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          {collection.title}
        </h2>
        <p className="text-sm text-muted-foreground">{collection.pitch}</p>
        <Link
          to={`/collections/c/${collection.slug}`}
          viewTransition
          className="mt-1 inline-flex h-10 w-fit items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Открыть · {titlesCount(collection.total)}
        </Link>
      </div>
      <div className="-mx-4 flex min-w-0 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-1 lg:px-0 [&::-webkit-scrollbar]:hidden">
        {collection.covers.map((anime) => (
          <Link
            key={anime.id}
            to={`/anime/${anime.slug || anime.id}`}
            className="group flex w-28 shrink-0 flex-col gap-1.5 sm:w-32"
          >
            <img
              src={imageSrc(anime.imageUrl)}
              alt=""
              loading="lazy"
              className="aspect-[2/3] w-full rounded-xl object-cover ring-1 ring-border/50 transition-transform duration-300 group-hover:-translate-y-1"
            />
            <span className="line-clamp-2 text-xs font-medium leading-snug">{labels.title(anime)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
