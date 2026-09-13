import type { AnimeDetail } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LibraryControls } from "@/components/anime/library-controls";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ROTATE_MS = 9_000;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Rotating, near-fullscreen hero. Each slide prefers the title's own official
 * wide key-visual banner (AniList), falling back to a show screenshot and
 * then a blurred poster — with a slow cinematic pan. No embedded video, so
 * there's nothing for YouTube's bot-check to break.
 */
export function SpotlightCarousel({ items }: { items: AnimeDetail[] }) {
  const slides = items.slice(0, 6);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = prefersReducedMotion();
  const desktop = useMediaQuery("(min-width: 640px)");
  const touchX = useRef<number | null>(null);

  const count = slides.length;
  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + count) % count),
    [count],
  );

  useEffect(() => {
    if (reduced || paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, paused, count]);

  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (count === 0) return null;
  const anime = slides[index]!;
  const shot = anime.bannerImage ?? anime.screenshots[0];
  const heroImg = shot
    ? imageSrc(shot)
    : imageSrc(anime.imageLargeUrl ?? anime.imageUrl);
  const landscape = Boolean(shot);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        if (start != null && end != null && Math.abs(end - start) > 50) {
          go(end < start ? 1 : -1);
        }
        touchX.current = null;
      }}
    >
      {/* Mobile: image and text are two separate blocks, stacked — the image
          keeps its own real aspect ratio (object-cover barely has to crop
          it), text sits below on the card's own background. Desktop: the
          classic overlay, a fixed-height box with text on top of the photo —
          that's never had a cropping problem, wide screen matches a wide
          banner reasonably well. */}
      <div className="flex flex-col sm:relative sm:block sm:h-[70vh] lg:h-[78vh]">
        <div className="relative aspect-video w-full overflow-hidden sm:absolute sm:inset-0 sm:aspect-auto sm:h-full sm:w-full">
          {heroImg ? (
            <img
              key={heroImg}
              src={heroImg}
              alt=""
              fetchPriority="high"
              className={cn(
                "absolute inset-0 size-full object-cover",
                !landscape && "object-[center_22%]",
                desktop && "hero-pan",
              )}
            />
          ) : (
            <PosterFallback title={anime.title} seed={anime.id} />
          )}

          {/* Legibility gradient — desktop only, where text actually sits on
              the photo. Uses the theme's own card colour so it always has
              the right contrast direction against it, in either theme. */}
          <div className="pointer-events-none absolute inset-0 hidden sm:block sm:bg-gradient-to-r sm:from-card/85 sm:via-card/15 sm:to-transparent" />
        </div>

        {/* --- content --- */}
        <SlideContent key={anime.id} anime={anime} />

        {/* --- controls --- */}
        {/* Desktop: one dedicated strip pinned to the bottom of the overlay
            box, structurally separate from the text column above it (which
            reserves matching bottom padding) so text can grow as tall as it
            wants and only ever overflows upward. Mobile: a plain row after
            the text block, not on top of the photo. */}
        {count > 1 && (
          <div className="relative z-20 flex items-center gap-2 p-3 sm:absolute sm:inset-x-0 sm:bottom-0 sm:gap-4 sm:p-5">
            <NavButton side="left" onClick={() => go(-1)} />
            <div className="flex flex-1 items-center justify-center gap-2">
              {slides.map((s, i) => {
                const active = i === index;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`${i + 1}`}
                    aria-current={active}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "relative h-2 overflow-hidden rounded-full transition-all duration-500 ease-out",
                      active
                        ? "w-8 bg-foreground/25"
                        : "w-2 bg-foreground/25 hover:bg-foreground/45",
                    )}
                  >
                    {active && !reduced && !paused && (
                      <span
                        key={`${anime.id}-progress`}
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary"
                        style={{ animation: `spotlight-progress ${ROTATE_MS}ms linear` }}
                      />
                    )}
                    {active && (reduced || paused) && (
                      <span aria-hidden className="absolute inset-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
            <NavButton side="right" onClick={() => go(1)} />
          </div>
        )}
      </div>
    </section>
  );
}

function SlideContent({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const step = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className="reveal-group relative z-10 flex flex-col gap-2.5 p-4 sm:h-full sm:max-w-2xl sm:justify-end sm:gap-3 sm:px-10 sm:pt-8 sm:pb-20">
      <div
        className="reveal flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm"
        style={step(0)}
      >
        <span className="text-primary">{t("discover.nowScreening")}</span>
        {when && (
          <>
            <span className="size-1 rounded-full bg-muted-foreground/50" />
            <span>{when}</span>
          </>
        )}
      </div>

      {/* Sized (and clamped below) so the whole column reliably fits the
          box's height on any real viewport — this was the actual cause of
          text looking "cut off": the content was taller than the box, and
          growing from a bottom anchor means the overflow clips upward,
          straight through the title. Smaller text and a shorter synopsis
          clamp free up enough height that it no longer happens. */}
      <h1
        className="reveal line-clamp-2 font-display text-xl leading-[1.15] [overflow-wrap:anywhere] sm:text-3xl sm:leading-[1.15] lg:text-4xl"
        style={step(1)}
      >
        {title}
      </h1>

      <div
        className="reveal flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm"
        style={step(2)}
      >
        <ScoreBadge score={anime.score} size="md" />
        <span>{labels.typeLabel(anime.type)}</span>
        {episodes && <span>{episodes}</span>}
      </div>

      {/* Synopsis and genres are the first things cut on a phone — the
          title/rating/actions are what someone actually needs to decide
          "watch this", and cramming everything in is exactly what was
          making text collide with the button row and the nav dots below. */}
      {anime.synopsis && (
        <p
          className="reveal hidden max-w-xl text-sm leading-relaxed text-foreground/90 sm:line-clamp-2 sm:block"
          style={step(3)}
        >
          {anime.synopsis}
        </p>
      )}

      {anime.genresDetailed.length > 0 && (
        <div className="reveal hidden flex-wrap gap-1.5 sm:flex" style={step(4)}>
          {anime.genresDetailed.slice(0, 4).map((g) => (
            <Link key={g.id} to={`/browse?genres=${g.id}`}>
              <Badge variant="outline" className="hover:border-primary/50">
                {labels.genreLabel(g.name)}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="reveal mt-1 flex flex-wrap items-center gap-2 sm:gap-3" style={step(5)}>
        <Button asChild size="lg">
          <Link to={animeHref(anime)}>
            <PlayIcon className="size-4 fill-current" />
            {t("discover.viewDetails")}
          </Link>
        </Button>
        <TrailerButton url={anime.trailerEmbedUrl} title={title} />
        <LibraryControls animeId={anime.id} title={title} />
      </div>
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side}
      className="shrink-0 rounded-full border border-border/60 bg-background/70 p-2 text-foreground/80 shadow-sm backdrop-blur transition-all hover:scale-105 hover:bg-background hover:text-primary sm:p-2.5"
    >
      {side === "left" ? (
        <ChevronLeftIcon className="size-4 sm:size-5" />
      ) : (
        <ChevronRightIcon className="size-4 sm:size-5" />
      )}
    </button>
  );
}

/* Back-compat: single-item spotlight still used as a fallback. */
export function Spotlight({ anime }: { anime: AnimeDetail }) {
  return <SpotlightCarousel items={[anime]} />;
}

export function SpotlightSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:block">
      <Skeleton className="aspect-video w-full rounded-2xl sm:hidden" />
      <Skeleton className="h-40 w-full rounded-2xl sm:hidden" />
      <Skeleton className="hidden rounded-2xl sm:block sm:h-[70vh] lg:h-[78vh]" />
    </div>
  );
}
