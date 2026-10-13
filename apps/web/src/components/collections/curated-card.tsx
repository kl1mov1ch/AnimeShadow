import type { CuratedCollection } from "@animeshadow/shared";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CompassIcon } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * One of the site's themed lists, as a card in the site's own colours:
 * three posters fanned out, the icon, the name, a line on what it is, the count.
 */
export function CuratedCard({ collection, className }: { collection: CuratedCollection; className?: string }) {
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const covers = collection.covers.slice(0, 3);
  return (
    <Link
      to={`/collections/c/${collection.slug}`}
      viewTransition
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-colors duration-200 hover:border-foreground/20 hover:bg-card",
        className,
      )}
    >
      <div className="relative flex h-40 items-end justify-center overflow-hidden bg-foreground/[0.03] pt-4">
        <span className="absolute right-2 top-2 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {titlesCount(collection.total)}
        </span>
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
              "absolute bottom-[-0.9rem] aspect-[2/3] w-[5.5rem] rounded-lg object-cover shadow-lg shadow-black/40 ring-1 ring-black/25 transition-transform duration-300 ease-out",
              i === 0 && "z-10 group-hover:-translate-y-1",
              i === 1 && "-translate-x-[3.5rem] -rotate-6 scale-90 opacity-90",
              i === 2 && "translate-x-[3.5rem] rotate-6 scale-90 opacity-90",
            )}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{collection.title}</span>
        </span>
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{collection.pitch}</span>
      </div>
    </Link>
  );
}

/**
 * The collection of the day: its name and pitch, and its titles in a row
 * that moves with arrow buttons on a computer and a swipe on a phone —
 * in the site's colours, quiet enough to sit at the top of the page.
 */
export function DailyCurated({ collection }: { collection: CuratedCollection }) {
  const labels = useLabels();
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const row = useRef<HTMLDivElement>(null);
  const move = (dir: -1 | 1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <section className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex min-w-0 flex-col gap-2 lg:w-72 lg:shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Подборка дня</span>
        <h2 className="flex items-center gap-2 font-display text-xl leading-tight sm:text-2xl">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          {collection.title}
        </h2>
        <p className="text-sm text-muted-foreground">{collection.pitch}</p>
        <Link
          to={`/collections/c/${collection.slug}`}
          viewTransition
          className="mt-1 inline-flex h-10 w-fit items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Открыть · {titlesCount(collection.total)}
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <div className="relative min-w-0 lg:flex-1">
        <div
          ref={row}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:scroll-px-5 sm:px-5 lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {collection.covers.map((anime) => (
            <Link key={anime.id} to={`/anime/${anime.slug || anime.id}`} className="group flex w-28 shrink-0 snap-start flex-col gap-1.5 sm:w-32">
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[2/3] w-full rounded-xl object-cover ring-1 ring-border/50 transition-[box-shadow] duration-200 group-hover:ring-foreground/30"
              />
              <span className="line-clamp-2 text-xs font-medium leading-snug">{labels.title(anime)}</span>
            </Link>
          ))}
        </div>
        {/* Arrows on a computer; a phone swipes. */}
        <div className="pointer-events-none absolute inset-y-0 -left-1 -right-1 hidden items-center justify-between lg:flex">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Назад"
            className="pointer-events-auto -mt-8 grid size-9 place-items-center rounded-full border border-border/70 bg-background/90 text-foreground/80 shadow-md transition-colors hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Вперёд"
            className="pointer-events-auto -mt-8 grid size-9 place-items-center rounded-full border border-border/70 bg-background/90 text-foreground/80 shadow-md transition-colors hover:text-foreground"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
