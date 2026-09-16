import type { AnimeSummary } from "@animeshadow/shared";
import { PlayCircleIcon /* , StarIcon */ } from "lucide-react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
// Overall score is hidden for now (not deleted) — uncomment to bring it back.
// import { ScoreBadge } from "@/components/anime/score-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating } from "@/hooks/use-adult-content";
import { paletteFromSeed, useImagePalette } from "@/hooks/use-image-palette";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";

/**
 * A stretched-out row for the catalogue's list view — poster on the left,
 * details filling the width, and a vivid blurred wash of the poster's own
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
  // No poster at all — never let the row go flat/grey; wash it with a
  // seeded colour instead (same treatment PosterFallback gives the thumbnail).
  const fallbackPalette = src ? null : paletteFromSeed(String(anime.id));
  const isAdult = isAdultRating(anime.rating);

  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes, when]
    .filter(Boolean)
    .join(" · ");
  const genreLine = anime.genres.slice(0, 3).map(labels.genreLabel).join(", ");

  return (
    <div
      className="group relative flex gap-3 overflow-hidden rounded-xl border border-border/60 p-2.5 transition-colors hover:border-border sm:gap-4 sm:p-3"
    >
      {/* Vivid blurred echo of the poster, tinted by its own dominant colour. */}
      {src && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <img
            src={src}
            alt=""
            className="size-full scale-125 object-cover opacity-45 blur-2xl saturate-150"
          />
          <div
            className="absolute inset-0 bg-card/55"
            style={
              palette
                ? { backgroundColor: `rgb(${palette.rgb} / 0.3)` }
                : undefined
            }
          />
        </div>
      )}
      {fallbackPalette && (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-card/40"
          style={{
            backgroundImage: `radial-gradient(120% 100% at 0% 0%, rgb(${fallbackPalette.rgb} / 0.28), transparent 70%)`,
          }}
        />
      )}

      <Link to={animeHref(anime)} className="relative flex min-w-0 flex-1 gap-3 sm:gap-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-36 sm:w-24">
          {src ? (
            <img
              src={src}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
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

        <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
              {title}
            </h3>
            {/* {anime.score != null && <ScoreBadge score={anime.score} className="shrink-0" />} */}
          </div>
          <p className="text-xs text-muted-foreground">{metaLine}</p>
          {genreLine && (
            <p className="text-xs text-muted-foreground/70">{genreLine}</p>
          )}
          {anime.synopsis && (
            <p className="line-clamp-1 text-xs text-foreground/70 sm:line-clamp-2">
              {anime.synopsis}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-xs tabular-nums text-muted-foreground/70">
            {/* {anime.scoredBy != null && anime.scoredBy > 0 && (
              <span className="inline-flex items-center gap-1">
                <StarIcon className="size-3" />
                {t("common.ratings", { count: labels.compact(anime.scoredBy) })}
              </span>
            )} */}
            {anime.members != null && anime.members > 0 && (
              <span>{t("home.views", { views: labels.compact(anime.members) })}</span>
            )}
          </div>
        </div>
      </Link>

      {anime.trailerEmbedUrl && (
        <ListRowTrailer url={anime.trailerEmbedUrl} title={title} />
      )}
    </div>
  );
}

/** Same trailer dialog as the detail page, just triggered from a corner of the row
 * instead of the parent Link — clicking it must not also navigate. */
function ListRowTrailer({ url, title }: { url: string; title: string }) {
  const t = useT();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("trailer.open")}
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur transition-colors hover:bg-background hover:text-primary sm:bottom-3 sm:right-3"
        >
          <PlayCircleIcon className="size-3.5" />
          <span className="hidden sm:inline">{t("trailer.open")}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("trailer.title", { title })}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={url}
            title={t("trailer.title", { title })}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full"
          />
        </div>
      </DialogContent>
    </Dialog>
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
