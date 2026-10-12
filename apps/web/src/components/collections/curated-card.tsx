import type { CuratedCollection } from "@animeshadow/shared";
import { ArrowRightIcon, CompassIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** A stable hue per themed list, so each has its own colour. */
function hueOf(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
}

/**
 * One of the site's themed lists, as a card: its own colour, three posters
 * fanned out, the icon, the name, a line on what it is and the count.
 */
export function CuratedCard({ collection, className }: { collection: CuratedCollection; className?: string }) {
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const covers = collection.covers.slice(0, 3);
  const hue = hueOf(collection.slug);
  return (
    <Link
      to={`/collections/c/${collection.slug}`}
      viewTransition
      style={{ "--h": hue } as CSSProperties}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--h)_70%_60%/0.18)] bg-card/60 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--h)_70%_60%/0.45)]",
        className,
      )}
    >
      <div className="relative flex h-40 items-end justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,hsl(var(--h)_70%_45%/0.35),transparent_70%)] pt-4">
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
              "absolute bottom-[-0.9rem] aspect-[2/3] w-[5.75rem] rounded-lg object-cover shadow-lg shadow-black/50 ring-1 ring-black/25 transition-transform duration-300 ease-out",
              i === 0 && "z-10 group-hover:-translate-y-1.5",
              i === 1 && "-translate-x-[3.75rem] -rotate-[8deg] scale-90 group-hover:-translate-x-[4.25rem]",
              i === 2 && "translate-x-[3.75rem] rotate-[8deg] scale-90 group-hover:translate-x-[4.25rem]",
            )}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--h)_70%_55%/0.18)] text-[hsl(var(--h)_80%_72%)]">
            <Icon className="size-4" />
          </span>
          <span className="truncate">{collection.title}</span>
        </span>
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{collection.pitch}</span>
      </div>
    </Link>
  );
}

/**
 * The collection of the day, as a banner: the first title's poster as a
 * dimmed backdrop, the name and pitch, and a fan of posters to the right
 * (a strip that scrolls sideways on a phone).
 */
export function DailyCurated({ collection }: { collection: CuratedCollection }) {
  const labels = useLabels();
  const Icon = CURATED_ICON[collection.icon] ?? CompassIcon;
  const hue = hueOf(collection.slug);
  const backdrop = collection.covers[0]?.imageUrl;
  return (
    <section
      style={{ "--h": hue } as CSSProperties}
      className="relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl border border-[hsl(var(--h)_70%_60%/0.25)] bg-card p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-8"
    >
      {backdrop && (
        <img
          aria-hidden
          src={imageSrc(backdrop)}
          alt=""
          decoding="async"
          className="pointer-events-none absolute inset-0 -z-20 size-full scale-110 object-cover opacity-25"
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(100deg,var(--card)_25%,color-mix(in_srgb,var(--card)_70%,transparent)_60%,transparent),radial-gradient(80%_120%_at_0%_0%,hsl(var(--h)_70%_45%/0.35),transparent_60%)]"
      />
      <div className="flex min-w-0 flex-col gap-3 lg:w-80 lg:shrink-0">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[hsl(var(--h)_70%_55%/0.18)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--h)_80%_75%)]">
          <span className="size-1.5 rounded-full bg-current" />
          Подборка дня
        </span>
        <h2 className="flex items-center gap-2.5 font-display text-2xl leading-tight sm:text-3xl">
          <Icon className="size-6 shrink-0 text-[hsl(var(--h)_80%_72%)]" />
          {collection.title}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">{collection.pitch}</p>
        <Link
          to={`/collections/c/${collection.slug}`}
          viewTransition
          className="group/btn mt-1 inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5"
        >
          Открыть · {titlesCount(collection.total)}
          <ArrowRightIcon className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
        </Link>
      </div>
      <div className="-mx-5 flex min-w-0 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-1 lg:px-0 [&::-webkit-scrollbar]:hidden">
        {collection.covers.slice(0, 8).map((anime, i) => (
          <Link
            key={anime.id}
            to={`/anime/${anime.slug || anime.id}`}
            className="group relative flex w-28 shrink-0 flex-col gap-1.5 sm:w-32"
          >
            <span className="relative block overflow-hidden rounded-xl ring-1 ring-white/10">
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/65 text-[11px] font-bold tabular-nums text-white">
                {i + 1}
              </span>
            </span>
            <span className="line-clamp-2 text-xs font-medium leading-snug transition-colors group-hover:text-primary">{labels.title(anime)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
