import type { AnimeSummary } from "@animeshadow/shared";
import { ClockIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { ScoreBadge } from "@/components/anime/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating, useAdultConfirmed } from "@/hooks/use-adult-content";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface AnimeCardProps {
  anime: AnimeSummary;
  /** Eager-load the poster for above-the-fold cards. */
  priority?: boolean;
  className?: string;
}

/** Days/hours until an ISO release date, or null when it's past / unknown. */
function useReleaseCountdown(airedFrom: string | null): string | null {
  const t = useT();
  if (!airedFrom) return null;
  const ts = Date.parse(airedFrom);
  if (!Number.isFinite(ts)) return null;
  const diff = ts - Date.now();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / 86_400_000);
  if (days > 1) return t("card.countdownDays", { days });
  const hours = Math.ceil(diff / 3_600_000);
  return hours > 0 ? t("card.countdownHours", { hours }) : t("card.countdownSoon");
}

export function AnimeCard({ anime, priority = false, className }: AnimeCardProps) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes].filter(Boolean).join(" · ");
  const genreLine = anime.genres.slice(0, 2).map(labels.genreLabel).join(", ");

  const hasScore = anime.score != null;
  const airing = anime.airing === "AIRING";
  const unreleased = anime.airing === "UPCOMING";
  const countdown = useReleaseCountdown(anime.airedFrom);
  const isAdult = isAdultRating(anime.rating);
  const [adultConfirmed] = useAdultConfirmed();
  const blurPoster = isAdult && !adultConfirmed;

  return (
    <Link
      to={animeHref(anime)}
      className={cn("group flex flex-col gap-2 outline-none", className)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/60 bg-muted transition-[border-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:border-border group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        {anime.imageUrl ? (
          <img
            src={imageSrc(anime.imageUrl)}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            className={cn(
              "size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none",
              blurPoster && "blur-lg scale-110",
            )}
          />
        ) : (
          <PosterFallback title={title} seed={anime.id} />
        )}

        {isAdult && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-rose-600/90 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            18+
          </span>
        )}

        {/* One signal, top-left: the score, or a countdown when there's no score yet. */}
        {hasScore ? (
          <ScoreBadge score={anime.score} className="absolute left-2 top-2 z-10" />
        ) : countdown ? (
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/90 backdrop-blur">
            <ClockIcon className="size-3 text-muted-foreground/70" />
            {countdown}
          </span>
        ) : null}

        {/* "Coming soon" only — the "airing" tag added noise without telling the
            user anything they don't already get from the season/year line. */}
        {unreleased ? (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {t("card.soon")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {title}
        </h3>
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {metaLine}
            {airing && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-primary">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {t("airing.airingShort")}
              </span>
            )}
          </span>
          {when && <span className="shrink-0 tabular-nums">{when}</span>}
        </div>
        {(genreLine || anime.members != null) && (
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground/70">
            <span className="min-w-0 truncate">{genreLine}</span>
            {anime.members != null && anime.members > 0 && (
              <span className="shrink-0 tabular-nums">
                {t("home.views", { views: labels.compact(anime.members) })}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function AnimeCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}
