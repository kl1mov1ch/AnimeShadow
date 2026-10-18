import type { CuratedCollection } from "@animeshadow/shared";
import { CompassIcon, PlayIcon, StarIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
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
        "group/cc relative isolate flex min-h-[15rem] sm:min-h-[17rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-card transition-[border-color] duration-300 hover:border-foreground/20",
        className,
      )}
    >
      {backdrop && (
        <img aria-hidden src={imageSrc(backdrop, 640)} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 size-full object-cover opacity-20" />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/85 to-card/20" />
      <span className="absolute right-2.5 top-2.5 z-20 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        {titlesCount(collection.total)}
      </span>
      <div className="relative mx-3 mt-3 min-h-28 flex-1 sm:min-h-36">
        {fan.map((anime, i) => {
          const offset = i - mid;
          return (
            <span
              key={anime.id}
              className="cc-fan absolute bottom-0 left-1/2 aspect-[2/3] w-[5rem] overflow-hidden rounded-lg border border-white/15 bg-muted shadow-lg shadow-black/40"
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
              <img src={imageSrc(anime.imageUrl, 480)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            </span>
          );
        })}
      </div>
      <div className="relative flex min-w-0 flex-col gap-1 p-3 pt-2">
        <span className="flex items-center gap-2 font-display text-base leading-tight">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2">{collection.title}</span>
        </span>
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{collection.pitch}</span>
      </div>
    </Link>
  );
}

/**
 * The collection of the day, as a little showcase: its titles as a grid of
 * posters to pick from, and the picked one large beside them — its poster,
 * score, genres, a few lines about it and a way to watch. It moves on to the
 * next title by itself every few seconds until the visitor points at it;
 * no arrows, nothing to scroll.
 */
export function DailyCurated({ collection }: { collection: CuratedCollection }) {
  const labels = useLabels();
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const items = collection.covers.slice(0, 8);
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || items.length < 2) return;
    const id = window.setTimeout(() => setAt((i) => (i + 1) % items.length), 6000);
    return () => window.clearTimeout(id);
  }, [at, held, items.length]);
  const anime = items[at];
  if (!anime) return null;
  const meta = [labels.typeLabel(anime.type), anime.year, anime.episodes ? `${anime.episodes} эп.` : null].filter(Boolean).join(" · ");

  return (
    <section
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      className="relative isolate grid gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6"
    >
      <img
        key={anime.id}
        aria-hidden
        src={imageSrc(anime.imageUrl, 480)}
        alt=""
        decoding="async"
        className="pointer-events-none absolute inset-y-0 left-0 -z-10 h-full w-full animate-in object-cover opacity-[0.12] duration-700 fade-in-0 [mask-image:linear-gradient(to_right,#000_40%,transparent)] lg:w-2/3"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Подборка дня · {collection.title}
            </span>
          </span>
          <Link to={`/collections/c/${collection.slug}`} viewTransition className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Все {titlesCount(collection.total)} →
          </Link>
        </div>
        <div key={anime.id} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
          <Link to={`/anime/${anime.slug || anime.id}`} className="shrink-0">
            <img src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)} alt="" decoding="async" className="aspect-[2/3] w-28 rounded-xl object-cover ring-1 ring-white/10 sm:w-36" />
          </Link>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link to={`/anime/${anime.slug || anime.id}`} className="font-display text-xl leading-tight transition-colors hover:text-primary sm:text-2xl">
              {labels.title(anime)}
            </Link>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {anime.score != null && (
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
                  {anime.score.toFixed(1)}
                </span>
              )}
              {meta}
            </span>
            {anime.genres.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {anime.genres.slice(0, 3).map((g) => (
                  <span key={g} className="rounded-md bg-foreground/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
                    {labels.genreLabel(g)}
                  </span>
                ))}
              </span>
            )}
            {anime.synopsis && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80 sm:line-clamp-4">{anime.synopsis}</p>}
            <Link
              to={`/anime/${anime.slug || anime.id}#watch`}
              className="mt-auto inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PlayIcon className="size-4 fill-current" />
              Смотреть
            </Link>
          </div>
        </div>
      </div>

      {/* The titles to pick from: a 4×2 grid, the picked one lit; a thin line
          under it fills while it waits to move on. */}
      <div className="grid grid-cols-4 content-start gap-2">
        {items.map((it, i) => {
          const on = i === at;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setAt(i)}
              onMouseEnter={() => setAt(i)}
              onFocus={() => setAt(i)}
              aria-pressed={on}
              aria-label={labels.title(it)}
              className={cn(
                "relative overflow-hidden rounded-lg ring-2 transition-[opacity,box-shadow] duration-200",
                on ? "opacity-100 ring-primary" : "opacity-55 ring-transparent hover:opacity-90",
              )}
            >
              <img src={imageSrc(it.imageUrl)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-full object-cover" />
              {on && !held && items.length > 1 && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <span key={at} className="daily-fill block h-full bg-primary" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
