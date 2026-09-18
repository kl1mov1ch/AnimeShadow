import type { AnimeSummary } from "@animeshadow/shared";
import { ClockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { OpeningVideo } from "@/components/anime/opening-video";
import { PosterFallback } from "@/components/anime/poster-fallback";
// Overall score is hidden for now (not deleted) — uncomment to bring it back.
// import { ScoreBadge } from "@/components/anime/score-badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating } from "@/hooks/use-adult-content";
import { useMediaQuery } from "@/hooks/use-media-query";
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

/** How long the cursor has to settle before the opening is even requested.
 *  Sweeping across a grid crosses a dozen cards in well under this, so a
 *  pass over the catalogue costs no requests and no video at all. */
const OPENING_HOVER_INTENT_MS = 700;

export function AnimeCard({ anime, priority = false, className }: AnimeCardProps) {
  const t = useT();
  const labels = useLabels();
  const canHover = useMediaQuery("(hover: hover)");
  const [openingWanted, setOpeningWanted] = useState(false);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startIntent = () => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(
      () => setOpeningWanted(true),
      OPENING_HOVER_INTENT_MS,
    );
  };
  const cancelIntent = () => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    setOpeningWanted(false);
  };
  useEffect(() => () => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
  }, []);
  const title = labels.title(anime);
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes].filter(Boolean).join(" · ");
  const genreLine = anime.genres.slice(0, 2).map(labels.genreLabel).join(", ");

  // const hasScore = anime.score != null;
  const airing = anime.airing === "AIRING";
  const unreleased = anime.airing === "UPCOMING";
  const countdown = useReleaseCountdown(anime.airedFrom);
  const isAdult = isAdultRating(anime.rating);

  const card = (
    <Link
      to={animeHref(anime)}
      className={cn("group flex flex-col gap-2 outline-none", className)}
    >
      <div
        // Not even attached on a touch device: there is no hover to intend,
        // OpeningVideo would refuse to render, and the request is disabled —
        // so the only thing these could do there is churn state on a tap.
        {...(canHover ? { onMouseEnter: startIntent, onMouseLeave: cancelIntent } : {})}
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/60 bg-muted transition-[border-color,transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-lg group-hover:shadow-primary/10 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      >
        {/* Everything below is opacity/transform only — nothing that forces
            a repaint on scroll — and all of it sits behind `group-hover:`,
            which Tailwind v4 compiles into `@media (hover: hover)`, so a
            phone never runs any of it. */}
        {anime.imageUrl ? (
          // Two variants, picked by the browser before anything is fetched.
          //
          // The large one (225x318 from Shikimori, 319x450 from MAL) is what
          // a 2:3 poster actually needs on a desktop grid — the small one is
          // Shikimori's 160px "preview" and visibly upscales there. But large
          // costs ~60KB against ~27KB, and a phone showing two columns of
          // them pays that over and over on a connection that can least
          // afford it. Below `sm` the small one is served instead: softer,
          // less than half the bytes.
          <picture>
            <source media="(max-width: 639px)" srcSet={imageSrc(anime.imageUrl)} />
            <img
              src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
          </picture>
        ) : (
          <PosterFallback title={title} seed={anime.id} />
        )}

        {/* The show itself, once the cursor has actually settled here. Sits
            over the poster and fades in only when there are real frames, so
            a title with no opening in the archive — or a request that never
            finishes — simply leaves the poster alone. */}
        <div className="pointer-events-none absolute inset-0">
          <OpeningVideo animeId={anime.id} active={openingWanted} />
        </div>

        {/* One move, not three. The play disc is gone: with the opening
            itself running behind this, a badge in the middle of the picture
            was covering the very thing it was inviting you to look at, and
            saying "playable" over footage that is already playing. What's
            left is a gentle darkening from the bottom, which exists only so
            the countdown and "coming soon" badges keep their contrast once
            the video underneath them starts moving. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        />

        {isAdult && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-rose-600/90 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            18+
          </span>
        )}

        {/* One signal, top-left: the score, or a countdown when there's no score yet.
            The score is hidden for now (not deleted) — only the countdown shows:
        {hasScore ? (
          <ScoreBadge score={anime.score} className="absolute left-2 top-2 z-10" />
        ) : countdown ? ( */}
        {countdown ? (
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

  // Touch devices have no hover to preview on — skip the extra portal/DOM
  // entirely there rather than shipping a feature that can never trigger.
  if (!canHover) return card;

  return (
    <HoverCard openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={10} className="w-80">
        <AnimeCardPreview anime={anime} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The extra detail a hover reveals — everything the compact card had no room
 * for (full genre list, synopsis) plus what's already visible, restated
 * larger. No new visual language: same badge, same type scale, just more of
 * it, so the preview reads as "the same card, unfolded" rather than a
 * different surface.
 */
function AnimeCardPreview({ anime }: { anime: AnimeSummary }) {
  const labels = useLabels();
  const title = labels.title(anime);
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes, when]
    .filter(Boolean)
    .join(" · ");
  const genreLine = anime.genres.slice(0, 5).map(labels.genreLabel).join(", ");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 font-display text-sm leading-snug text-foreground">
          {title}
        </h4>
        {/* {anime.score != null && (
          <ScoreBadge score={anime.score} className="shrink-0" />
        )} */}
      </div>
      <p className="text-xs text-muted-foreground">{metaLine}</p>
      {genreLine && <p className="text-xs text-muted-foreground/80">{genreLine}</p>}
      {anime.synopsis && (
        <p className="line-clamp-4 text-xs leading-relaxed text-foreground/80">
          {anime.synopsis}
        </p>
      )}
    </div>
  );
}

export function AnimeCardSkeleton({ className }: { className?: string }) {
  return (
    // rounded-2xl, matching the real poster — the skeleton used to draw a
    // rounded-xl box, so every card visibly changed shape the moment its
    // data arrived.
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}
