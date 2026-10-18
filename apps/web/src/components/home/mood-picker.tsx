import type { CuratedCollection } from "@animeshadow/shared";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Skeleton } from "@/components/ui/skeleton";
import { CURATED_ICON, titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useCuratedCollections } from "@/lib/query";
import { cn } from "@/lib/utils";

/** The moods offered, by themed collection, with a name short enough for a phone's half-width tile. */
const MOODS: Array<{ slug: string; label: string }> = [
  { slug: "cozy", label: "Уютное" },
  { slug: "laugh", label: "Посмеяться" },
  { slug: "romance", label: "Про любовь" },
  { slug: "chills", label: "Мурашки" },
  { slug: "mind-games", label: "Психология" },
  { slug: "sport", label: "Спорт" },
];

/**
 * "What kind of evening is it?" — six moods, each a themed collection, in
 * one panel with the site's mark behind it. Something to pick rather than
 * another row to scroll past: a tap opens the collection. On a computer a
 * hovered mood fans out its first posters.
 */
export function HomeMoodPicker() {
  const { data, isPending } = useCuratedCollections(true);
  const bySlug = new Map((data?.items ?? []).map((c) => [c.slug, c]));
  const moods = MOODS.map((m) => ({ ...m, collection: bySlug.get(m.slug) })).filter(
    (m): m is { slug: string; label: string; collection: CuratedCollection } => m.collection != null,
  );
  if (!isPending && moods.length < 4) return null;

  return (
    <section className="group/panel relative isolate overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card/90 via-card/50 to-card/20 p-4 sm:p-6">
      <LogoWatermark className="-right-4 -top-20 hidden size-80 rotate-[10deg] sm:block" />
      <div className="flex flex-wrap items-start justify-between gap-2 sm:items-end">
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-tight sm:text-xl">Под настроение</h2>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            Какой сегодня вечер?<span className="hidden sm:inline"> Выберите — подберём аниме</span>
          </p>
        </div>
        <Link
          to="/recommendations"
          viewTransition
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95"
        >
          <SparklesIcon className="size-3.5" />
          Для вас
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-6">
        {isPending && moods.length === 0
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[4.25rem] rounded-xl" />)
          : moods.map(({ slug, label, collection }) => {
              const Icon = CURATED_ICON[collection.icon];
              return (
                <Link
                  key={slug}
                  to={`/collections/c/${slug}`}
                  viewTransition
                  title={collection.title}
                  className="group relative flex min-h-24 min-w-0 flex-col items-start gap-2 rounded-xl border border-border/60 bg-background/65 p-3 transition-colors duration-150 hover:border-primary/40 hover:bg-background/80 sm:min-h-17 sm:flex-row sm:items-center sm:gap-2.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="relative z-10 flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold leading-5 [overflow-wrap:anywhere] sm:text-sm">{label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{titlesCount(collection.total)}</span>
                  </span>
                  <Fan covers={collection.covers} />
                  <ArrowRightIcon
                    aria-hidden
                    className="absolute right-2.5 size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 lg:hidden"
                  />
                </Link>
              );
            })}
      </div>
    </section>
  );
}

/** Three posters, stacked in the tile's corner, that fan out on hover — a computer only. */
function Fan({ covers }: { covers: CuratedCollection["covers"] }) {
  const three = covers.slice(0, 3);
  if (three.length === 0) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute -bottom-7 right-0 hidden lg:block">
      {three.map((anime, i) => (
        <img
          key={anime.id}
          src={imageSrc(anime.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          style={{ zIndex: i }}
          className={cn(
            "absolute bottom-0 aspect-[2/3] w-9 rounded-md object-cover opacity-0 shadow-lg shadow-black/50 ring-1 ring-black/30 transition-[transform,opacity] duration-300 ease-out group-hover:opacity-100",
            i === 0 && "right-8 translate-y-4 group-hover:-translate-y-1 group-hover:-rotate-12",
            i === 1 && "right-4 translate-y-4 group-hover:-translate-y-3 group-hover:-rotate-3",
            i === 2 && "right-0 translate-y-4 group-hover:-translate-y-2 group-hover:rotate-6",
          )}
        />
      ))}
    </span>
  );
}
