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
      {/* A fixed height (not min-height) — otherwise a longer title/synopsis
          on one slide grows the box and the whole page jumps as slides
          rotate. Title/synopsis are clamped below so they never overflow it. */}
      <div className="relative h-[58vh] w-full sm:h-[70vh] lg:h-[78vh]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {heroImg ? (
            <>
              {/* Atmospheric blurred fill, always on — on mobile it's load-
                  bearing, not decoration: a wide banner shown `object-contain`
                  in a narrow phone-width box leaves bars on the sides, and
                  this is what fills them instead of empty space. */}
              <img
                src={heroImg}
                alt=""
                aria-hidden
                className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
              />
              {/* Full image, uncropped, on mobile — a wide banner forced to
                  `object-cover` a narrow tall box was cropping away most of
                  its width. Desktop's box is wide enough that cover-cropping
                  a banner reads fine, so it keeps the fuller-bleed look. */}
              <img
                key={heroImg}
                src={heroImg}
                alt=""
                fetchPriority="high"
                className={cn(
                  "absolute inset-0 size-full object-contain sm:object-cover",
                  landscape ? "sm:object-center" : "sm:object-[center_22%]",
                  desktop && "hero-pan",
                )}
              />
            </>
          ) : (
            <PosterFallback title={anime.title} seed={anime.id} />
          )}
        </div>

        {/* --- legibility gradient --- */}
        {/* Uses the theme's own card colour (light in light mode, dark in
            dark mode) so the text — which also flips colour with the theme —
            always has the *correct* contrast direction against it. Kept to a
            light touch: just enough for the text to not blend into the
            photo, not a heavy wash over the whole image. */}
        <div className="absolute inset-0 bg-gradient-to-t from-card/85 via-card/25 to-transparent sm:bg-gradient-to-r sm:via-card/15 sm:to-transparent" />

        {/* --- content --- */}
        <SlideContent key={anime.id} anime={anime} />

        {/* --- controls --- */}
        {/* One dedicated strip at the very bottom, structurally separate from
            the text column above it (which reserves matching bottom padding).
            The text can grow as tall as it wants and only ever overflows
            *upward* (clipped by the section's own overflow-hidden) — it can
            never reach down into this strip, so the arrows and dots never
            touch it, at any content length or viewport size. */}
        {count > 1 && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 p-3 sm:gap-4 sm:p-5">
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
    <div className="reveal-group relative z-10 flex h-full max-w-2xl flex-col justify-end gap-2.5 p-4 pb-20 sm:gap-4 sm:p-10 sm:pb-20">
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

      <h1
        className="reveal line-clamp-2 font-display text-xl leading-[1.15] [overflow-wrap:anywhere] sm:text-4xl sm:leading-[1.1] lg:text-5xl"
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
          className="reveal hidden max-w-xl text-sm leading-relaxed text-foreground/90 sm:line-clamp-3 sm:block"
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
  return <Skeleton className="h-[58vh] w-full rounded-2xl sm:h-[70vh] lg:h-[78vh]" />;
}
