import type { AnimeSummary } from "@animeshadow/shared";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { ScoreBadge } from "@/components/anime/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating, useAdultConfirmed } from "@/hooks/use-adult-content";
import { useImagePalette } from "@/hooks/use-image-palette";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * A stretched-out row for the catalogue's list view — poster on the left,
 * details filling the width, and a soft blurred wash of the poster's own
 * colour behind the whole row (the same palette technique as the anime
 * page's ambient backdrop, just scoped to one card instead of the page).
 */
export function AnimeListRow({
  anime,
  priority = false,
}: {
  anime: AnimeSummary;
  priority?: boolean;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);
  const src = imageSrc(anime.imageUrl);
  const palette = useImagePalette(src);
  const isAdult = isAdultRating(anime.rating);
  const [adultConfirmed] = useAdultConfirmed();
  const blurPoster = isAdult && !adultConfirmed;

  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes, when]
    .filter(Boolean)
    .join(" · ");
  const genreLine = anime.genres.slice(0, 3).map(labels.genreLabel).join(", ");

  return (
    <Link
      to={animeHref(anime)}
      className="group relative flex gap-3 overflow-hidden rounded-xl border border-border/60 p-2.5 transition-colors hover:border-border sm:gap-4 sm:p-3"
    >
      {/* Soft blurred echo of the poster, tinted by its own dominant colour. */}
      {src && !blurPoster && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <img
            src={src}
            alt=""
            className="size-full scale-125 object-cover opacity-25 blur-2xl"
          />
          <div
            className="absolute inset-0 bg-card/75"
            style={
              palette
                ? { backgroundColor: `rgb(${palette.rgb} / 0.16)` }
                : undefined
            }
          />
        </div>
      )}
      {!src && <div aria-hidden className="absolute inset-0 -z-10 bg-card/40" />}

      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-36 sm:w-24">
        {src ? (
          <img
            src={src}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            className={cn(
              "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              blurPoster && "blur-lg scale-110",
            )}
          />
        ) : (
          <PosterFallback title={title} seed={anime.id} />
        )}
        {isAdult && (
          <span className="absolute right-1 top-1 rounded bg-rose-600/90 px-1 py-0.5 text-[10px] font-bold text-white">
            18+
          </span>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
            {title}
          </h3>
          {anime.score != null && <ScoreBadge score={anime.score} className="shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground">{metaLine}</p>
        {genreLine && (
          <p className="text-xs text-muted-foreground/70">{genreLine}</p>
        )}
        {anime.synopsis && (
          <p className="line-clamp-2 text-xs text-foreground/70 sm:line-clamp-3">
            {anime.synopsis}
          </p>
        )}
        {anime.members != null && anime.members > 0 && (
          <p className="mt-auto text-xs tabular-nums text-muted-foreground/70">
            {t("home.views", { views: labels.compact(anime.members) })}
          </p>
        )}
      </div>
    </Link>
  );
}

export function AnimeListRowSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border/60 p-2.5 sm:gap-4 sm:p-3">
      <Skeleton className="h-28 w-20 shrink-0 rounded-lg sm:h-36 sm:w-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
