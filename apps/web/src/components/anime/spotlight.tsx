import type { AnimeDetail, WatchResponse } from "@animeshadow/shared";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  PlayIcon,
  TvIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { LibraryControls } from "@/components/anime/library-controls";
import { PosterFallback } from "@/components/anime/poster-fallback";
// Overall score is hidden for now (not deleted) — uncomment to bring it back.
// import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

const ROTATE_MS = 9_000;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** "PG-13 - Teens 13 or older" / "pg_13" / "r_plus" → "PG-13" / "PG-13" / "R+". */
function shortRating(rating: string | null): string | null {
  const head = rating?.split(" - ")[0]?.trim();
  if (!head) return null;
  return head.replace(/_plus$/i, "+").replace(/_/g, "-").toUpperCase();
}

/**
 * Rotating homepage hero. Always rendered as a dark "screening room" card
 * (the `dark` class re-scopes every theme token inside it), so the text,
 * buttons and the list select stay legible over the artwork in either site
 * theme. Title and metadata sit top-left; actions and carousel controls
 * share one wrapping row at the bottom, so they can never overlap.
 */
export function SpotlightCarousel({ items }: { items: AnimeDetail[] }) {
  const slides = items.slice(0, 6);
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduced = prefersReducedMotion();
  const desktop = useMediaQuery("(min-width: 640px)");
  const touchX = useRef<number | null>(null);

  const count = slides.length;
  const paused = hidden || hovered;
  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + count) % count),
    [count],
  );

  // `index` is a dependency on purpose: any manual jump restarts the full
  // interval, keeping auto-advance in step with the progress bar.
  useEffect(() => {
    if (reduced || paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, paused, count, index]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (count === 0) return null;
  const anime = slides[index] ?? slides[0]!;
  const shot = anime.bannerImage ?? anime.screenshots[0];
  const heroImg = shot ? imageSrc(shot) : imageSrc(anime.imageLargeUrl ?? anime.imageUrl);
  const landscape = Boolean(shot);

  return (
    <section
      aria-roledescription="carousel"
      className="dark relative isolate overflow-hidden rounded-3xl border border-border/70 bg-background text-foreground shadow-xl shadow-black/10"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      <div className="relative flex flex-col sm:min-h-[430px] lg:min-h-[480px]">
        {/* Mobile: artwork on top at its natural ratio, content stacked below.
            Desktop: artwork fills the card behind the content. */}
        <div className="relative aspect-video w-full overflow-hidden sm:absolute sm:inset-0 sm:aspect-auto">
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

          {desktop && !reduced && <SpotlightVideo key={anime.id} animeId={anime.id} />}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent sm:hidden"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-background via-background/80 to-background/10 sm:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 hidden h-44 bg-gradient-to-b from-background/75 to-transparent sm:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-48 bg-gradient-to-t from-background via-background/70 to-transparent sm:block"
          />
        </div>

        <SlideContent
          key={anime.id}
          anime={anime}
          controls={
            count > 1 ? (
              <SlideControls
                slides={slides}
                index={index}
                running={!reduced && !paused}
                onSelect={setIndex}
                onStep={go}
              />
            ) : null
          }
        />
      </div>
    </section>
  );
}

function MetaChip({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-foreground/90 backdrop-blur [&_svg]:size-3.5 [&_svg]:text-foreground/55",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A muted clip of the show itself behind the slide — AniLibria's direct HLS
 * stream, so no YouTube embed and no bot check. Only when a playable HLS
 * source exists; it fades in over the still once it's actually playing and
 * simply never appears otherwise. Armed after a short dwell, so clicking
 * through slides quickly doesn't fire a stream lookup per slide.
 */
function SpotlightVideo({ animeId }: { animeId: number }) {
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 1_200);
    return () => clearTimeout(id);
  }, []);

  const { data } = useWatchSources(animeId, armed);
  const src = pickClip(data);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const native = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    // Past the opening credits, into actual scenes.
    const onMetadata = () => {
      if (native && video.duration > 400) video.currentTime = CLIP_START_SECONDS;
      void video.play().catch(() => undefined);
    };
    // Native `loop` just restarts at 0 — right back into the OP/credits this
    // clip specifically skipped past. Looping by hand instead means every
    // replay lands on the same in-scene moment, not the show's title card.
    const onEnded = () => {
      video.currentTime = CLIP_START_SECONDS;
      void video.play().catch(() => undefined);
    };
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("ended", onEnded);

    if (native) {
      video.src = src;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const instance = new Hls({
          startPosition: CLIP_START_SECONDS,
          capLevelToPlayerSize: true,
          maxBufferLength: 20,
        });
        instance.loadSource(src);
        instance.attachMedia(video);
        hls = instance;
      });
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("ended", onEnded);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  if (!src) return null;
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-1000",
        playing ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

const CLIP_START_SECONDS = 180;

function pickClip(data: WatchResponse | undefined): string | null {
  const source = data?.sources.find(
    (candidate) => candidate.format === "hls" && candidate.stable !== false && candidate.hlsEpisodes,
  );
  const episodes = source?.hlsEpisodes;
  if (!episodes) return null;
  return episodes["1"] ?? Object.values(episodes)[0] ?? null;
}

function SlideContent({
  anime,
  controls,
}: {
  anime: AnimeDetail;
  controls: ReactNode;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);
  const altTitle =
    [anime.titleJapanese, anime.titleEnglish, anime.title].find(
      (candidate) => candidate?.trim() && candidate !== title,
    ) ?? null;
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const rating = shortRating(anime.rating);
  const step = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className="reveal-group relative z-10 flex flex-1 flex-col gap-4 p-4 sm:justify-between sm:gap-7 sm:p-7 lg:p-9">
      <div className="flex max-w-2xl flex-col gap-3">
        <div className="reveal flex flex-col gap-1" style={step(0)}>
          <h1 className="line-clamp-2 font-display text-2xl leading-[1.1] text-foreground [overflow-wrap:anywhere] sm:text-3xl lg:text-[2.5rem]">
            {title}
          </h1>
          {altTitle && <p className="line-clamp-1 text-sm text-foreground/55">{altTitle}</p>}
        </div>

        {/* One line, the essentials only — airing state, format, episode
            count, year, age rating, and a couple of genres to place it.
            Runtime, ranking and member counts live on the anime's own page;
            a hero card is a reason to click through, not a stats sheet. */}
        <div className="reveal flex flex-wrap items-center gap-1.5" style={step(1)}>
          {anime.airing !== "UNKNOWN" && (
            <MetaChip>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  anime.airing === "AIRING"
                    ? "bg-emerald-400"
                    : anime.airing === "UPCOMING"
                      ? "bg-amber-400"
                      : "bg-foreground/40",
                )}
              />
              {labels.airingLabel(anime.airing)}
            </MetaChip>
          )}
          <MetaChip icon={<TvIcon />}>{labels.typeLabel(anime.type)}</MetaChip>
          {episodes && <MetaChip icon={<ClapperboardIcon />}>{episodes}</MetaChip>}
          {when && <MetaChip icon={<CalendarDaysIcon />}>{when}</MetaChip>}
          {rating && <MetaChip>{rating}</MetaChip>}
          {anime.genresDetailed.slice(0, 2).map((genre) => (
            <Link
              key={genre.id}
              to={`/browse?genres=${genre.id}`}
              className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-xs text-foreground/75 backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
            >
              {labels.genreLabel(genre.name)}
            </Link>
          ))}
        </div>
      </div>

      <div
        className="reveal flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
        style={step(2)}
      >
        <div className="flex flex-wrap items-center gap-2 [&_[data-slot=button]]:rounded-full [&_[data-slot=select-trigger]]:h-10! [&_[data-slot=select-trigger]]:rounded-full [&_[data-slot=select-trigger]]:bg-background/50 [&_[data-slot=select-trigger]]:backdrop-blur [&_[data-slot=button]:not([data-size^=icon])]:h-10!">
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/10 px-4 text-foreground backdrop-blur hover:bg-white/20"
          >
            <Link to={animeHref(anime)}>
              <PlayIcon className="size-3.5" />
              {t("discover.viewDetails")}
            </Link>
          </Button>
          <TrailerButton url={anime.trailerEmbedUrl} title={title} />
          <LibraryControls animeId={anime.id} title={title} />
        </div>
        {controls}
      </div>
    </div>
  );
}

function SlideControls({
  slides,
  index,
  running,
  onSelect,
  onStep,
}: {
  slides: AnimeDetail[];
  index: number;
  running: boolean;
  onSelect: (index: number) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const labels = useLabels();
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 rounded-full border border-white/10 bg-background/60 p-1 backdrop-blur-md sm:justify-start">
      <NavButton side="left" onClick={() => onStep(-1)} />
      <div className="flex items-center gap-1.5 px-1">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <button
              key={slide.id}
              type="button"
              aria-label={labels.title(slide)}
              aria-current={active}
              onClick={() => onSelect(i)}
              className={cn(
                "relative h-1.5 overflow-hidden rounded-full transition-all duration-500 ease-out",
                active ? "w-10 bg-foreground/20" : "w-1.5 bg-foreground/35 hover:w-3 hover:bg-foreground/70",
              )}
            >
              {active &&
                (running ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 origin-left rounded-full bg-primary"
                    style={{ animation: `spotlight-progress ${ROTATE_MS}ms linear` }}
                  />
                ) : (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-primary" />
                ))}
            </button>
          );
        })}
      </div>
      <NavButton side="right" onClick={() => onStep(1)} />
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? t("common.previous") : t("common.next")}
      className="grid size-9 shrink-0 place-items-center rounded-full text-foreground/80 transition-[background-color,color,transform] hover:bg-foreground/10 hover:text-foreground active:scale-90"
    >
      {side === "left" ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
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
      <Skeleton className="aspect-video w-full rounded-3xl sm:hidden" />
      <Skeleton className="h-56 w-full rounded-3xl sm:hidden" />
      <Skeleton className="hidden rounded-3xl sm:block sm:h-[430px] lg:h-[480px]" />
    </div>
  );
}
