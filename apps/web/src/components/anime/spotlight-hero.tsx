import type { AnimeDetail, HeroClips } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  StarIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TrailerButton } from "@/components/anime/trailer-button";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { useSlowConnection } from "@/lib/connection";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";

/** A slide with a clip holds for the clip's ten seconds; a picture, seven. */
const CLIP_MS = 10_000;
const PICTURE_MS = 7_000;

/** Whether this tab is in the background — the slider stops while it is. */
function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

/** The slide's picture for a 16:9 frame: a frame of the show itself first
 *  (the right shape, and what the clip will continue), then the wide
 *  banner, then the poster. */
function frameOf(anime: AnimeDetail): string | undefined {
  return imageSrc(anime.screenshots[0] ?? anime.bannerImage ?? fullSizeCover(anime.imageLargeUrl ?? anime.imageUrl));
}

/**
 * The homepage hero: what is airing now and popular (see the API's
 * pickHeroLineup), one title at a time, at a fixed height.
 *
 * The picture and the clip sit in a 16:9 frame — the shape they were made
 * in, so nothing is cut off on a wide screen or a phone; behind everything,
 * the same picture blurred fills the width. On a computer the pitch is on
 * the left with the titles of the rotation as small frames under it (the
 * current one fills a line as its time runs, hovering the hero holds it);
 * on a phone the frame runs edge to edge on top, a swipe moves between
 * titles, and the pitch is under it.
 *
 * The clip (HeroClipService) fades in over the picture only once it plays,
 * the phone-sized one on a phone, none on a slow connection or with reduced
 * motion. Only the slide on screen loads its clip; the next slide's picture
 * is loaded while the current one is up.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const hidden = useTabHidden();
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [primed, setPrimed] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  useEffect(() => {
    if (count === 0) return;
    const next = (index + 1) % count;
    setPrimed((prev) => (prev.has(index) && prev.has(next) ? prev : new Set([...prev, index, next])));
  }, [index, count]);

  const slow = useSlowConnection();
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 1023px)");
  const { data: clips } = useQuery({
    queryKey: ["hero-clips"],
    enabled: !slow && !calm,
    queryFn: ({ signal }) => apiRequest<HeroClips>("/hero-clips", { signal }),
    staleTime: 5 * 60_000,
  });

  const current = slides[index] ?? slides[0];
  const clip = current ? clips?.[String(current.id)] : undefined;
  const slideMs = clip ? CLIP_MS : PICTURE_MS;
  const paused = hidden || hovered;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), slideMs);
    return () => clearTimeout(timer);
  }, [count, index, run, paused, slideMs]);

  // A swipe across the frame moves between titles on a touch screen.
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (count === 0 || !current) return null;

  const go = (next: number) => {
    setIndex(((next % count) + count) % count);
    setRun((r) => r + 1);
  };
  const title = labels.title(current);
  const progressKey = `${index}-${run}-${paused}`;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="full-bleed relative isolate overflow-hidden border-b border-border/50 bg-background outline-none"
    >
      {/* The current picture, blurred, behind everything. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {slides.map((slide, i) => {
          const art = frameOf(slide);
          return art && primed.has(i) ? (
            <img
              key={slide.id}
              src={art}
              alt=""
              decoding="async"
              className={cn(
                "absolute inset-0 size-full scale-110 object-cover blur-2xl transition-opacity duration-1000",
                i === index ? "opacity-40" : "opacity-0",
              )}
            />
          ) : null;
        })}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/40" />
      </div>

      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 pb-5 sm:px-6 lg:h-[30rem] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-10 lg:py-8">
        {/* The frame: 16:9, the shape of the picture and the clip. */}
        <div
          className="relative -mx-4 aspect-video overflow-hidden bg-black/40 sm:-mx-6 lg:order-2 lg:mx-0 lg:h-full lg:w-auto lg:max-w-full lg:justify-self-end lg:rounded-2xl lg:shadow-2xl lg:shadow-black/40 lg:ring-1 lg:ring-white/10"
          onTouchStart={(e) => {
            const p = e.touches[0];
            if (p) touch.current = { x: p.clientX, y: p.clientY };
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            const p = e.changedTouches[0];
            touch.current = null;
            if (!start || !p) return;
            const dx = p.clientX - start.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(p.clientY - start.y)) go(index + (dx < 0 ? 1 : -1));
          }}
        >
          {slides.map((slide, i) => {
            const art = frameOf(slide);
            const on = i === index;
            return (
              <div
                key={slide.id}
                aria-hidden={!on}
                className={cn("absolute inset-0 transition-opacity duration-700 ease-out", on ? "opacity-100" : "opacity-0")}
              >
                {art && primed.has(i) && (
                  <img
                    src={art}
                    alt=""
                    decoding="async"
                    fetchPriority={i === 0 ? "high" : "low"}
                    className={cn("absolute inset-0 size-full object-cover", on && "home-kenburns")}
                  />
                )}
                {on && !hidden && clip && <HeroClip src={narrow ? clip.sd : clip.hd} />}
              </div>
            );
          })}
          {/* A phone's frame fades into the pitch under it. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent lg:hidden" />
          {count > 1 && (
            <div className="absolute inset-y-0 right-2 hidden items-center lg:flex">
              <HeroArrow label={t("common.next")} onClick={() => go(index + 1)}>
                <ChevronRightIcon className="size-4" />
              </HeroArrow>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1 lg:h-full lg:justify-center">
          <SlidePitch key={current.id} anime={current} title={title} />

          {count > 1 && (
            <>
              {/* A computer: the rotation as small frames. */}
              <div className="hidden gap-2 lg:flex">
                {slides.map((slide, i) => {
                  const active = i === index;
                  const art = frameOf(slide);
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={labels.title(slide)}
                      title={labels.title(slide)}
                      aria-current={active}
                      className={cn(
                        "group/t relative aspect-video w-[4.75rem] shrink-0 overflow-hidden rounded-lg ring-1 transition-[transform,opacity] duration-300",
                        active ? "ring-white/40" : "opacity-55 ring-white/10 hover:-translate-y-0.5 hover:opacity-90",
                      )}
                    >
                      {art && <img src={art} alt="" loading="lazy" className="size-full object-cover" />}
                      {active && (
                        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
                          <span
                            key={progressKey}
                            className={cn("absolute inset-0 origin-left bg-primary", paused ? "scale-x-0" : "hero-progress")}
                            style={{ animationDuration: `${slideMs}ms` }}
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* A phone: one segment per title, the current one filling. */}
              <div className="flex items-center gap-3 lg:hidden">
                <HeroArrow label={t("common.previous")} onClick={() => go(index - 1)}>
                  <ChevronLeftIcon className="size-4" />
                </HeroArrow>
                <div className="flex flex-1 items-center gap-1.5">
                  {slides.map((slide, i) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={labels.title(slide)}
                      className="relative h-6 flex-1"
                    >
                      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15">
                        {i < index && <span className="absolute inset-0 bg-foreground/50" />}
                        {i === index && (
                          <span
                            key={progressKey}
                            className={cn("absolute inset-0 origin-left bg-primary", paused ? "scale-x-0" : "hero-progress")}
                            style={{ animationDuration: `${slideMs}ms` }}
                          />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <HeroArrow label={t("common.next")} onClick={() => go(index + 1)}>
                  <ChevronRightIcon className="size-4" />
                </HeroArrow>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A clip over the slide's picture: invisible until it is really playing,
 * then a slow fade in. If it never plays (blocked autoplay, a slow line, a
 * missing file) the picture simply stays — nothing to see go wrong.
 */
function HeroClip({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <video
      key={src}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      disablePictureInPicture
      preload="auto"
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out",
        playing ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * The pitch: what the title is and what to do with it, in a block of a set
 * height — a long name or synopsis is clamped, never pushing the hero
 * taller. Keyed on the slide by its parent, so it fades in as one piece.
 */
function SlidePitch({ anime, title }: { anime: AnimeDetail; title: string }) {
  const t = useT();
  const labels = useLabels();
  const when = labels.seasonYearLabel(anime);
  const episodes = anime.episodes ? labels.episodeLabel(anime.episodes, anime.type) : null;
  const facts = [labels.typeLabel(anime.type), when, episodes].filter(Boolean) as string[];

  return (
    <div className="flex min-w-0 animate-in flex-col duration-500 ease-out fade-in-0 slide-in-from-bottom-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
        {anime.score != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-black/45 px-2 py-0.5 font-semibold tabular-nums text-white">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
            {anime.score.toFixed(1)}
          </span>
        )}
        {anime.airing === "AIRING" && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
            {labels.airingLabel(anime.airing)}
          </span>
        )}
        <span className="truncate text-foreground/75">{facts.join(" · ")}</span>
      </div>

      <h2 className="mt-2.5 line-clamp-2 min-h-[2.1em] font-display text-2xl leading-[1.08] text-foreground sm:text-4xl lg:text-[2.2rem]">
        <Link to={animeHref(anime)} viewTransition className="transition-colors duration-300 hover:text-foreground/80">
          {title}
        </Link>
      </h2>

      {anime.synopsis && (
        <p className="mt-3 hidden max-w-xl text-sm leading-relaxed text-foreground/75 sm:line-clamp-2 lg:line-clamp-3">
          {anime.synopsis}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button asChild size="lg" className="h-11 px-6 text-[15px]">
          <Link to={`${animeHref(anime)}#watch`} viewTransition>
            <PlayIcon className="fill-current" />
            {t("home.heroWatch")}
          </Link>
        </Button>
        <TrailerButton url={anime.trailerEmbedUrl} title={title} />
        <KeepButton anime={anime} title={title} />
      </div>
    </div>
  );
}

/** Plan-to-watch straight from the hero; the bookmark turns into a tick. */
function KeepButton({ anime, title }: { anime: AnimeDetail; title: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data: library } = useLibrary(undefined, authed);
  const upsert = useUpsertLibraryEntry();
  const kept = library?.some((entry) => entry.anime.id === anime.id) ?? false;

  const keep = () => {
    if (!authed) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    if (kept) {
      navigate("/library");
      return;
    }
    upsert.mutate(
      { animeId: anime.id, input: { status: "PLANNED", score: null, notes: null } },
      {
        onSuccess: () => toast.success(t("library.savedStatus", { title, status: t("status.PLANNED") })),
        onError: () => toast.error(t("library.saveError")),
      },
    );
  };

  const label = kept ? t("card.inList") : t("card.addToList");
  return (
    <button
      type="button"
      onClick={keep}
      disabled={upsert.isPending}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 place-items-center rounded-lg border transition-colors duration-200 active:scale-95",
        kept
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-white/15 bg-black/30 text-foreground hover:border-white/30 hover:bg-black/45",
      )}
    >
      <MorphIcon on={kept} off={BookmarkPlusIcon} onIcon={BookmarkCheckIcon} className="size-[18px]" />
    </button>
  );
}

function HeroArrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/40 text-foreground/80 transition-colors duration-200 hover:border-white/30 hover:bg-black/55 hover:text-foreground active:scale-95"
    >
      {children}
    </button>
  );
}

/** The hero's own placeholder, the same shape and the same fixed height. */
export function SpotlightHeroSkeleton() {
  return (
    <section className="full-bleed border-b border-border/50 bg-background">
      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 pb-5 sm:px-6 lg:h-[30rem] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-10 lg:py-8">
        <Skeleton className="-mx-4 aspect-video rounded-none sm:-mx-6 lg:order-2 lg:mx-0 lg:h-full lg:w-auto lg:justify-self-end lg:rounded-2xl" />
        <div className="flex flex-col gap-3 lg:order-1">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="hidden h-12 w-full max-w-xl lg:block" />
          <Skeleton className="h-11 w-56 rounded-lg" />
        </div>
      </div>
    </section>
  );
}
