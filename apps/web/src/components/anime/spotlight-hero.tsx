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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** A slide without a clip stays up this long; one with a clip, as long as
 *  the clip runs (twelve seconds, see HeroClipService). */
const PICTURE_MS = 7_000;
/** How long a slide waits for its clip to start before it runs as a picture. */
const CLIP_GRACE_MS = 3_500;

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

/** Whether the element is on screen — scrolled past, the slider rests. */
function useOnScreen(ref: React.RefObject<Element | null>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOn(entry ? entry.isIntersecting : true), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}

/** The slide's picture for a 16:9 frame: a frame of the show itself first
 *  (the right shape, and what the clip will continue), then the wide
 *  banner, then the poster. */
function frameOf(anime: AnimeDetail): string | undefined {
  return imageSrc(anime.screenshots[0] ?? anime.bannerImage ?? fullSizeCover(anime.imageLargeUrl ?? anime.imageUrl));
}

type Mode = "wait" | "clip" | "picture";

/**
 * The homepage hero: what is airing now and popular (see the API's
 * pickHeroLineup), one title at a time, at a fixed height.
 *
 * The picture fills most of it. On a computer the frame runs from a quarter
 * of the way across to the page's right edge at the hero's full height,
 * fading out to the left under the pitch; the titles of the rotation sit
 * under the pitch as small frames. On a phone the frame runs edge to edge
 * on top, a little taller than 16:9, with the title laid over its lower
 * edge; a swipe moves between titles.
 *
 * A slide with a clip (HeroClipService: twelve seconds from the middle of
 * the opening) lasts exactly as long as the clip: the line under the slide
 * follows the clip's own time, and the next slide comes when it ends — never
 * mid-scene. A slide without one, or whose clip didn't start within a few
 * seconds, runs seven seconds as a picture. The next slide's clip is loaded
 * while the current one plays, so it starts at once. Hovering the hero,
 * scrolling it away or leaving the tab holds the slide, clip included.
 *
 * The progress is one CSS variable on the section, set every frame; nothing
 * re-renders while a slide runs.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const hidden = useTabHidden();
  const sectionRef = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(sectionRef);
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [primed, setPrimed] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const next = count > 0 ? (index + 1) % count : 0;
  useEffect(() => {
    if (count === 0) return;
    setPrimed((prev) => (prev.has(index) && prev.has(next) ? prev : new Set([...prev, index, next])));
  }, [index, next, count]);

  const slow = useSlowConnection();
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 1023px)");
  const { data: clips } = useQuery({
    queryKey: ["hero-clips"],
    enabled: !slow && !calm,
    queryFn: ({ signal }) => apiRequest<HeroClips>("/hero-clips", { signal }),
    staleTime: 5 * 60_000,
  });
  const clipOf = (slide: AnimeDetail | undefined) => {
    const clip = slide ? clips?.[String(slide.id)] : undefined;
    return clip ? (narrow ? clip.sd : clip.hd) : undefined;
  };

  const current = slides[index] ?? slides[0];
  const currentClip = clipOf(current);
  const paused = hidden || hovered || !onScreen;
  const videos = useRef(new Map<number, HTMLVideoElement>());

  const go = useCallback(
    (to: number, manual: boolean) => {
      if (count === 0) return;
      const target = ((to % count) + count) % count;
      setIndex((from) => {
        if (from !== target) setLeaving(from);
        return target;
      });
      if (manual) setRun((r) => r + 1);
    },
    [count],
  );
  // The slide that just left keeps its last frame while it fades out.
  useEffect(() => {
    if (leaving == null) return;
    const timer = setTimeout(() => setLeaving(null), 900);
    return () => clearTimeout(timer);
  }, [leaving]);

  // The clock: how far the current slide has run, as --hero-p on the
  // section (0…1), read by every progress line.
  const slideKey = `${index}:${run}`;
  const clock = useRef({ key: "", mode: "picture" as Mode, elapsed: 0, waited: 0 });
  const setProgress = useCallback((p: number) => {
    sectionRef.current?.style.setProperty("--hero-p", String(Math.min(1, Math.max(0, p))));
  }, []);
  useLayoutEffect(() => {
    clock.current = { key: slideKey, mode: currentClip ? "wait" : "picture", elapsed: 0, waited: 0 };
    setProgress(0);
    // Only a new slide starts the clock over; a clip arriving is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey, setProgress]);
  useEffect(() => {
    // The clip list came after the slide started: wait for its clip if the
    // slide is still young, keep going as a picture otherwise.
    const c = clock.current;
    if (currentClip && c.mode === "picture" && c.elapsed < 1_500) {
      clock.current = { ...c, mode: "wait", elapsed: 0, waited: 0 };
    }
  }, [currentClip]);

  useEffect(() => {
    if (count === 0 || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const c = clock.current;
      const video = videos.current.get(index);
      if (c.mode === "wait") {
        if (video && !video.paused && video.currentTime > 0.05) c.mode = "clip";
        else {
          c.waited += dt;
          if (c.waited > CLIP_GRACE_MS) c.mode = "picture";
        }
      }
      if (c.mode === "clip") {
        if (!video || video.error) c.mode = "picture";
        else if (video.ended) {
          // A lone slide loops its clip and never ends.
          setProgress(1);
          go(index + 1, false);
          return;
        } else if (video.duration > 0) setProgress(video.currentTime / video.duration);
      }
      if (c.mode === "picture") {
        c.elapsed += dt;
        setProgress(c.elapsed / PICTURE_MS);
        if (c.elapsed >= PICTURE_MS) {
          if (count > 1) {
            go(index + 1, false);
            return;
          }
          c.elapsed = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, index, paused, go, setProgress, slideKey]);

  // The current clip plays while the slide runs; every other one rests.
  useEffect(() => {
    for (const [i, video] of videos.current) {
      if (i === index && !paused) void video.play().catch(() => undefined);
      else video.pause();
    }
  }, [index, paused, currentClip, leaving]);

  const bindVideo = useCallback((i: number, video: HTMLVideoElement | null) => {
    if (video) videos.current.set(i, video);
    else videos.current.delete(i);
  }, []);

  // A swipe across the frame moves between titles on a touch screen.
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (count === 0 || !current) return null;

  const title = labels.title(current);

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label={title}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1, true);
        if (e.key === "ArrowRight") go(index + 1, true);
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
                i === index ? "opacity-35" : "opacity-0",
              )}
            />
          ) : null;
        })}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/45" />
      </div>

      <div className="relative mx-auto w-full max-w-[1400px] px-4 pb-4 sm:px-6 lg:static lg:h-[32rem] lg:pb-0">
        {/* The frame. */}
        <div
          className="hero-frame relative -mx-4 aspect-[4/3] overflow-hidden bg-black/30 sm:-mx-6 sm:aspect-video lg:absolute lg:inset-y-0 lg:left-[24%] lg:right-0 lg:mx-0 lg:aspect-auto"
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
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(p.clientY - start.y)) go(index + (dx < 0 ? 1 : -1), true);
          }}
        >
          {slides.map((slide, i) => {
            const art = frameOf(slide);
            const on = i === index;
            const src = clipOf(slide);
            // The current clip, the next one (loading ahead) and the one
            // fading out are mounted; no others.
            const mounted = src && (on || i === next || i === leaving);
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
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                {mounted && (
                  <HeroClip key={src} src={src} slide={i} bind={bindVideo} loop={count === 1} />
                )}
              </div>
            );
          })}
          {/* The lower edge fades into the page — on a phone the title sits on it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background via-background/70 to-transparent lg:hidden"
          />
          {count > 1 && (
            <div className="absolute inset-y-0 right-3 hidden items-center lg:flex">
              <HeroArrow label={t("common.next")} onClick={() => go(index + 1, true)}>
                <ChevronRightIcon className="size-4" />
              </HeroArrow>
            </div>
          )}
        </div>

        {/* A computer: a soft shade behind the pitch, where it overlaps the frame. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-3/5 bg-gradient-to-r from-background/85 via-background/45 to-transparent lg:block"
        />

        <div className="relative z-10 -mt-[5.75rem] flex min-w-0 flex-col gap-3.5 sm:-mt-28 lg:mt-0 lg:h-full lg:max-w-[min(34rem,46%)] lg:justify-center lg:gap-5">
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
                      onClick={() => go(i, true)}
                      aria-label={labels.title(slide)}
                      title={labels.title(slide)}
                      aria-current={active}
                      className={cn(
                        "relative aspect-video w-[4.5rem] shrink-0 overflow-hidden rounded-lg ring-1 transition-[transform,opacity] duration-300",
                        active ? "ring-white/45" : "opacity-50 ring-white/10 hover:-translate-y-0.5 hover:opacity-90",
                      )}
                    >
                      {art && <img src={art} alt="" loading="lazy" className="size-full object-cover" />}
                      {active && (
                        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
                          <span className="hero-progress absolute inset-0 bg-primary" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* A phone: one segment per title, the current one filling. */}
              <div className="flex items-center gap-2 lg:hidden">
                <HeroArrow label={t("common.previous")} onClick={() => go(index - 1, true)}>
                  <ChevronLeftIcon className="size-4" />
                </HeroArrow>
                <div className="flex flex-1 items-center gap-1.5">
                  {slides.map((slide, i) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => go(i, true)}
                      aria-label={labels.title(slide)}
                      className="relative h-7 flex-1"
                    >
                      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15">
                        {i < index && <span className="absolute inset-0 bg-foreground/45" />}
                        {i === index && <span className="hero-progress absolute inset-0 bg-primary" />}
                      </span>
                    </button>
                  ))}
                </div>
                <HeroArrow label={t("common.next")} onClick={() => go(index + 1, true)}>
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
 * A clip over the slide's picture: invisible until it really plays, then a
 * fade in. Mounted ahead of its slide (preload, paused) so it starts the
 * moment the slide comes; the parent plays and pauses it. If it never plays
 * (blocked autoplay, a slow line, a missing file) the picture simply stays.
 */
function HeroClip({
  src,
  slide,
  bind,
  loop,
}: {
  src: string;
  slide: number;
  bind: (slide: number, video: HTMLVideoElement | null) => void;
  loop: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <video
      ref={(video) => bind(slide, video)}
      src={src}
      muted
      loop={loop}
      playsInline
      disablePictureInPicture
      preload="auto"
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-500 ease-out",
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
      <div className="flex min-w-0 items-center gap-x-2.5 text-xs sm:text-sm">
        {anime.score != null && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 font-semibold tabular-nums text-white">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
            {anime.score.toFixed(1)}
          </span>
        )}
        {anime.airing === "AIRING" && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-emerald-400">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            {labels.airingLabel(anime.airing)}
          </span>
        )}
        <span className="truncate text-foreground/75">{facts.join(" · ")}</span>
      </div>

      <h2 className="mt-2 line-clamp-2 min-h-[2.1em] font-display text-[1.65rem] leading-[1.08] text-foreground [text-shadow:0_2px_16px_rgb(0_0_0/0.55)] sm:text-4xl lg:mt-3 lg:text-[2.4rem]">
        <Link to={animeHref(anime)} viewTransition className="transition-colors duration-300 hover:text-foreground/80">
          {title}
        </Link>
      </h2>

      {anime.synopsis && (
        <p className="mt-3 hidden max-w-xl text-sm leading-relaxed text-foreground/75 lg:line-clamp-3">{anime.synopsis}</p>
      )}

      <div className="mt-3.5 flex items-center gap-2.5 lg:mt-5">
        <Button asChild size="lg" className="h-11 flex-1 px-6 text-[15px] sm:flex-none">
          <Link to={`${animeHref(anime)}#watch`} viewTransition>
            <PlayIcon className="fill-current" />
            {t("home.heroWatch")}
          </Link>
        </Button>
        <TrailerButton url={anime.trailerEmbedUrl} title={title} compact />
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
        "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors duration-200 active:scale-95",
        kept
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-white/15 bg-black/35 text-foreground hover:border-white/30 hover:bg-black/50",
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
    <section className="full-bleed relative border-b border-border/50 bg-background">
      <div className="relative mx-auto w-full max-w-[1400px] px-4 pb-4 sm:px-6 lg:static lg:h-[32rem] lg:pb-0">
        <Skeleton className="-mx-4 aspect-[4/3] rounded-none sm:-mx-6 sm:aspect-video lg:absolute lg:inset-y-0 lg:left-[24%] lg:right-0 lg:mx-0 lg:aspect-auto" />
        <div className="relative z-10 -mt-[5.75rem] flex flex-col gap-3 sm:-mt-28 lg:mt-0 lg:h-full lg:max-w-[min(34rem,46%)] lg:justify-center">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="hidden h-12 w-full max-w-xl lg:block" />
          <Skeleton className="h-11 w-full rounded-lg sm:w-56" />
        </div>
      </div>
    </section>
  );
}
