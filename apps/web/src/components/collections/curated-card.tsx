import type { CuratedCollection } from "@animeshadow/shared";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CompassIcon } from "lucide-react";
import { type CSSProperties, useRef } from "react";
import { Link } from "react-router-dom";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * One of the site's themed lists, built like a viewer's collection card but
 * plainer: a poster as a dim backdrop (no blur), four posters fanned that
 * open up under the pointer, the name, a line on what it is, the count.
 */
export function CuratedCard({ collection, className }: { collection: CuratedCollection; className?: string }) {
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const fan = collection.covers.slice(0, 4);
  const mid = (fan.length - 1) / 2;
  const backdrop = collection.covers[0]?.imageUrl;
  return (
    <Link
      to={`/collections/c/${collection.slug}`}
      viewTransition
      className={cn(
        "group/cc relative isolate flex min-h-[17rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-card transition-[border-color] duration-300 hover:border-foreground/20",
        className,
      )}
    >
      {backdrop && (
        <img aria-hidden src={imageSrc(backdrop)} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 size-full object-cover opacity-20" />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/85 to-card/20" />
      <span className="absolute right-2.5 top-2.5 z-20 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        {titlesCount(collection.total)}
      </span>
      <div className="relative mx-3 mt-3 min-h-36 flex-1">
        {fan.map((anime, i) => {
          const offset = i - mid;
          return (
            <span
              key={anime.id}
              className="cc-fan absolute bottom-0 left-1/2 aspect-[2/3] w-[5rem] overflow-hidden rounded-lg border border-white/15 bg-muted shadow-xl shadow-black/50"
              style={
                {
                  "--x": `${offset * 52}%`,
                  "--x-open": `${offset * 78}%`,
                  "--r": `${offset * 7}deg`,
                  "--r-open": `${offset * 11}deg`,
                  "--y": `${Math.abs(offset) * 6}px`,
                  zIndex: 10 - Math.round(Math.abs(offset) * 2),
                } as CSSProperties
              }
            >
              <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            </span>
          );
        })}
      </div>
      <div className="relative flex min-w-0 flex-col gap-1 p-3 pt-2">
        <span className="flex items-center gap-2 font-display text-base leading-tight">
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
    <section className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 lg:flex-row lg:items-center lg:gap-5">
      <div className="flex min-w-0 flex-col gap-2 lg:w-60 lg:shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Подборка дня</span>
        <h2 className="flex items-center gap-2 font-display text-xl leading-tight">
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
          // Posters fill the row when they fit and scroll when they don't —
          // never a row ending in empty space.
          className="-mx-4 grid snap-x snap-mandatory auto-cols-[minmax(6rem,7.5rem)] grid-flow-col gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:auto-cols-[minmax(6.5rem,8.5rem)] lg:justify-between lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {collection.covers.map((anime) => (
            <Link key={anime.id} to={`/anime/${anime.slug || anime.id}`} className="group flex min-w-0 snap-start flex-col gap-1.5">
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
