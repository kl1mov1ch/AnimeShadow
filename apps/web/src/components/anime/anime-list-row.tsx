import type { AnimeSummary } from "@animeshadow/shared";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  CalendarIcon,
  ListVideoIcon,
  PlayCircleIcon,
  PlayIcon,
  StarIcon,
  TvIcon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { STATUS_META } from "@/components/library/library-meta";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKeep } from "@/hooks/use-keep";
import { cn } from "@/lib/utils";
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
 * details filling the width, and a blurred wash of the poster's own colour
 * behind the whole row (the same palette technique as the anime page's
 * ambient backdrop, just scoped to one card instead of the page).
 *
 * The wash is desktop-only on purpose: a scaled, blurred, saturated copy of
 * every poster is the single most expensive thing on this screen, and a
 * phone rendering twenty of them pays for it in scroll smoothness. Below
 * `sm` the row keeps the tinted surface without the blurred image.
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
  const { entry, keep, pending } = useKeep(anime, title);
  const status = entry ? STATUS_META[entry.status] : null;
  const percent =
    entry && anime.episodes && anime.episodes > 0 && entry.progress > 0
      ? Math.min(100, Math.round((entry.progress / anime.episodes) * 100))
      : null;

  return (
    <div className="group relative flex gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 sm:gap-4 sm:p-3">
      {/* Vivid blurred echo of the poster, tinted by its own dominant colour. */}
      {src && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <img
            src={src}
            alt=""
            className="hidden size-full scale-125 object-cover opacity-45 blur-2xl saturate-150 sm:block"
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

      {/* The same band of light every control on the site sweeps — pointer
          devices only, since `hover:`/`group-hover:` compile behind
          `@media (hover: hover)` in Tailwind v4. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/4 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
      />

      <Link to={animeHref(anime)} className="relative flex min-w-0 flex-1 gap-3 outline-none sm:gap-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-shadow duration-300 group-hover:ring-primary/30 sm:h-36 sm:w-24">
          {src ? (
            <img
              src={src}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <PosterFallback title={title} seed={anime.id} />
          )}
          {isAdult && (
            <span className="absolute right-1 top-1 rounded-md bg-rose-600/90 px-1 py-0.5 text-[10px] font-bold text-white">
              18+
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-display text-sm leading-snug text-foreground transition-colors duration-200 group-hover:text-primary sm:text-base">
              {title}
            </h3>
            {anime.score != null && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-500">
                <StarIcon className="size-3 fill-current" />
                {anime.score.toFixed(1)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TvIcon className="size-3 text-primary/70" />
              {labels.typeLabel(anime.type)}
            </span>
            {anime.episodes != null && anime.episodes > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ListVideoIcon className="size-3 text-primary/70" />
                {anime.episodes}
              </span>
            )}
            {when && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarIcon className="size-3 text-primary/70" />
                {when}
              </span>
            )}
            {anime.members != null && anime.members > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <UsersIcon className="size-3 text-primary/70" />
                {labels.compact(anime.members)}
              </span>
            )}
            {anime.airing === "AIRING" && (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {labels.airingLabel(anime.airing)}
              </span>
            )}
          </div>

          {anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {anime.genres.slice(0, 4).map((g) => (
                <span
                  key={g}
                  className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
                >
                  {labels.genreLabel(g)}
                </span>
              ))}
            </div>
          )}

          {anime.synopsis && (
            <p className="line-clamp-1 text-xs leading-relaxed text-foreground/70 sm:line-clamp-2">
              {anime.synopsis}
            </p>
          )}

          {/* Where it stands in the viewer's own list, and how far along. */}
          {entry && status && (
            <div className="mt-auto flex items-center gap-2 pt-0.5">
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", status.text)}>
                <status.Icon className="size-3.5" />
                {t(`status.${entry.status}`)}
              </span>
              {percent != null && entry.status !== "COMPLETED" && (
                <span className="flex flex-1 items-center gap-1.5">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-primary/10">
                    <span className={cn("block h-full", status.bar)} style={{ width: `${percent}%` }} />
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {entry.progress}/{anime.episodes}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="relative z-10 flex shrink-0 flex-col gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={`${animeHref(anime)}#watch`}
              viewTransition
              aria-label={t("card.watch")}
              className="btn-sheen grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:scale-105 active:scale-90"
            >
              <PlayIcon className="size-4 fill-current" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="left">{t("card.watch")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={keep}
              disabled={pending}
              aria-label={entry ? t("card.inList") : t("card.addToList")}
              className={cn(
                "grid size-9 place-items-center rounded-lg border transition-all hover:scale-105 active:scale-90",
                entry
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-primary/30 bg-card/60 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <MorphIcon on={entry != null} off={BookmarkPlusIcon} onIcon={BookmarkCheckIcon} className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{entry ? t("card.inList") : t("card.addToList")}</TooltipContent>
        </Tooltip>
        {anime.trailerEmbedUrl && <ListRowTrailer url={anime.trailerEmbedUrl} title={title} />}
      </div>
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
          title={t("trailer.open")}
          className="grid size-9 place-items-center rounded-lg border border-primary/30 bg-card/60 text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:text-primary active:scale-90"
        >
          <PlayCircleIcon className="size-4" />
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
    <div className="flex gap-3 rounded-2xl border border-border/60 p-2.5 sm:gap-4 sm:p-3">
      <Skeleton className="h-28 w-20 shrink-0 rounded-xl sm:h-36 sm:w-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
