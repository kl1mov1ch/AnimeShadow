import type { AnimeDetail } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  ChevronRightIcon,
  PlayIcon,
  PauseIcon,
  StarIcon,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";

/** How long a title stays up. */
const SLIDE_MS = 10_000;
/** How long each frame of it shows before the next fades in. */
const FRAME_MS = 4_000;
/** Frames per title: as many as fit in a slide. */
const MAX_FRAMES = 5;

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

/** A title's frames: shots from its episodes first, then the wide banner,
 *  then the poster — up to one per two seconds of the slide. */
function framesOf(anime: AnimeDetail): string[] {
  // A phone gets 640 px, a computer 1280 — the same copies the server's head preloads.
  const width = typeof window !== "undefined" && window.innerWidth <= 768 ? 640 : 1280;
  const shots = anime.screenshots
    .slice(0, MAX_FRAMES)
    .map((u) => imageSrc(u))
    .filter((u): u is string => Boolean(u))
    .map((u) => (u.includes("/api/img?") ? `${u}&w=${width}` : u));
  if (shots.length > 0) return shots;
  const one = imageSrc(anime.bannerImage ?? fullSizeCover(anime.imageLargeUrl ?? anime.imageUrl));
  return one ? [one] : [];
}

/**
 * The homepage hero: what is airing now and popular (see the API's
 * pickHeroLineup), one title at a time, at a fixed height.
 *
 * Each title stays ten seconds; within it, its episodes' frames take turns
 * every two seconds with a soft fade — loaded one by one as they come, never
 * all at once. The time left is drawn as a line running round the current
 * title's thumbnail (on a phone, a segment filling): a CSS animation, so
 * nothing re-renders while a slide runs, and when it ends the next title
 * comes. An explicit pause, scrolling away or leaving the tab holds it.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const hidden = useTabHidden();
  const sectionRef = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(sectionRef);
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [stopped, setStopped] = useState(false);
  const clockRef = useRef({ key: "", remaining: SLIDE_MS });
  const paused = hidden || stopped || !onScreen;

  // The slide that just left stays fully drawn under the new one until the
  // new one has faded in — so a switch never shows the dark page between.
  const [under, setUnder] = useState<number | null>(null);
  const go = useCallback(
    (to: number, manual: boolean) => {
      if (count === 0) return;
      const target = ((to % count) + count) % count;
      setIndex((from) => {
        if (from !== target) setUnder(from);
        return target;
      });
      if (manual) setRun((r) => r + 1);
    },
    [count],
  );
  useEffect(() => {
    if (under == null) return;
    const id = window.setTimeout(() => setUnder(null), 1100);
    return () => window.clearTimeout(id);
  }, [under, index]);

  // A real timer also works when animations are disabled by browser settings.
  useEffect(() => {
    const key = `${index}:${run}`;
    if (clockRef.current.key !== key) clockRef.current = { key, remaining: SLIDE_MS };
    if (paused || calm || count < 2) return;
    const clock = clockRef.current;
    const started = performance.now();
    const timer = setTimeout(() => go(index + 1, false), clock.remaining);
    return () => {
      clearTimeout(timer);
      clock.remaining = Math.max(0, clock.remaining - (performance.now() - started));
    };
  }, [paused, calm, count, index, run, go]);

  // A swipe across the frame moves between titles on a touch screen.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const current = slides[index] ?? slides[0];
  if (count === 0 || !current) return null;
  const title = labels.title(current);
  const slideKey = `${index}:${run}`;
  // Every timed thing of a slide runs off the same CSS duration and pause.
  const timing = {
    "--slide-ms": `${SLIDE_MS}ms`,
    animationPlayState: paused ? "paused" : "running",
  } as CSSProperties;

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
      className="full-bleed relative isolate overflow-hidden border-b border-border/50 bg-background outline-none"
    >
      {/* The slide's clock: invisible, it only says when the slide is over. */}
      {count > 1 && !calm && (
        <span key={slideKey} aria-hidden className="hero-clock" style={timing} />
      )}

      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_70%_0%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_60%)]" />

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
          {slides.map((slide, i) => (
            <SlideFrames
              key={slide.id}
              anime={slide}
              on={i === index}
              under={i === under}
              // The next title's first frame is fetched ahead, quietly.
              warm={i === (index + 1) % count}
              paused={paused || calm}
              first={i === 0}
            />
          ))}
          {!calm && <button type="button" onClick={() => setStopped((v) => !v)}
            aria-label={stopped ? "Продолжить слайдер" : "Приостановить слайдер"}
            className="absolute right-3 top-3 z-30 grid size-9 place-items-center rounded-full border border-white/15 bg-black/40 text-white hover:bg-black/65">
            {stopped ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
          </button>}
          {/* The lower edge fades into the page — on a phone the title sits on it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-3/4 bg-gradient-to-t from-background from-10% via-background/80 to-transparent lg:hidden"
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
              {/* A computer: the rotation as small frames; round the current
                  one runs a line — the time left before the next. */}
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:gap-2.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
                {slides.map((slide, i) => {
                  const active = i === index;
                  const art = framesOf(slide)[0];
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => go(i, true)}
                      aria-label={labels.title(slide)}
                      title={labels.title(slide)}
                      aria-current={active}
                      className={cn(
                        "relative aspect-video w-[5.25rem] shrink-0 rounded-lg p-[3px] transition-opacity duration-300 lg:w-[4.75rem]",
                        active ? "opacity-100" : "opacity-50 hover:opacity-90",
                      )}
                    >
                      <span className="block size-full overflow-hidden rounded-md bg-black/30">
                        {art && <img src={art} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
                      </span>
                      {active && (
                        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
                          <rect x="1" y="1" rx="8" style={{ width: "calc(100% - 2px)", height: "calc(100% - 2px)" }} className="fill-none stroke-white/15" strokeWidth="2" />
                          {!calm && (
                            <rect
                              key={slideKey}
                              x="1"
                              y="1"
                              rx="8"
                              pathLength={100}
                              className="hero-ring fill-none stroke-primary"
                              strokeWidth="2"
                              style={{ ...timing, width: "calc(100% - 2px)", height: "calc(100% - 2px)" }}
                            />
                          )}
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One title's frames in the hero, taken straight from the catalogue API
 * (stills of its newest episodes first) and shown as plain images
 * the browser loads and caches itself — nothing is held in memory by us.
 * Only two pictures are ever in the page: the one on screen and the one
 * coming in, which fades over it once it has loaded; the next turn starts
 * two seconds after that. The slide off screen shows nothing.
 */
function SlideFrames({
  anime,
  on,
  under,
  warm,
  paused,
  first,
}: {
  anime: AnimeDetail;
  on: boolean;
  under: boolean;
  warm: boolean;
  paused: boolean;
  first: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["hero-frames", anime.id],
    enabled: on || warm,
    staleTime: Infinity,
    queryFn: ({ signal }) => apiRequest<{ frames: string[] }>(`/anime/${anime.id}/frames?v=2`, { signal }).then((r) => r.frames),
  });
  const frames = useMemo(() => {
    // A smaller copy of each frame (the proxy makes and keeps it): a phone
    // gets 640 px, a computer 1280 — not the 350 KB originals.
    const width = typeof window !== "undefined" && window.innerWidth <= 768 ? 640 : 1280;
    const own = (data ?? [])
      .map((u) => imageSrc(u))
      .filter((u): u is string => Boolean(u))
      .map((u) => (u.includes("/api/img?") ? `${u}&w=${width}` : u));
    // In the order they come — the newest episodes first.
    return own.length > 0 ? own.slice(0, 8) : framesOf(anime);
  }, [data, anime]);

  const [base, setBase] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const [at, setAt] = useState(0);

  // On screen (or about to be): start from the first frame.
  useEffect(() => {
    if ((on || first || warm) && !base && frames[0]) setBase(frames[0]);
  }, [on, first, warm, base, frames]);
  useEffect(() => {
    if (!on) setAt(0);
  }, [on]);

  // Every two seconds, the next frame comes in over the current one.
  useEffect(() => {
    if (!on || paused || frames.length < 2 || incoming) return;
    const id = window.setTimeout(() => {
      const next = (at + 1) % frames.length;
      setAt(next);
      setArrived(false);
      setIncoming(frames[next]!);
    }, FRAME_MS);
    return () => window.clearTimeout(id);
  }, [on, paused, frames, at, incoming]);

  // Once it has faded in, it becomes the base and the old one goes.
  useEffect(() => {
    if (!arrived || !incoming) return;
    const id = window.setTimeout(() => {
      setBase(incoming);
      setIncoming(null);
      setArrived(false);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [arrived, incoming]);

  if (!base || (!on && !under && !warm && !first)) return null;
  return (
    <div
      aria-hidden={!on}
      className={cn(
        "absolute inset-0",
        // The new slide fades in on top; the one it replaces stays drawn below.
        on ? "z-10 opacity-100 transition-opacity duration-700 ease-out" : under ? "z-0 opacity-100" : "z-0 opacity-0",
      )}
    >
      <FadeImg key={base} src={base} priority={first}
        fallbacks={[imageSrc(anime.bannerImage), imageSrc(fullSizeCover(anime.imageLargeUrl ?? anime.imageUrl)), imageSrc(anime.imageUrl)].filter((url): url is string => !!url)} />
      {incoming && (
        <img
          key={incoming}
          src={incoming}
          alt=""
          decoding="async"
          onLoad={() => setArrived(true)}
          onError={() => setIncoming(null)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-in-out", arrived ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

/** A picture that fades in once it has loaded — never shown half-drawn; one
 *  already in the browser's cache shows at once, with no second fade. */
function FadeImg({ src, priority, fallbacks }: { src: string; priority: boolean; fallbacks: string[] }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const current = [src, ...fallbacks].find((url) => !failed.includes(url));
  useLayoutEffect(() => {
    setLoaded(!!ref.current?.complete && ref.current.naturalWidth > 0);
  }, [current]);
  if (!current) return null;
  return (
    <img
      ref={ref}
      key={current}
      src={current}
      alt=""
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed((urls) => [...urls, current])}
      className={cn("absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out", loaded ? "opacity-100" : "opacity-0")}
    />
  );
}

/**
 * The pitch: what the title is and what to do with it, in a block of a set
 * height — a long name or synopsis is clamped, never pushing the hero
 * taller. Keyed on the slide by its parent, so it fades in as one piece.
 */
function SlidePitch({ anime, title }: { anime: AnimeDetail; title: string }) {
  const labels = useLabels();
  const when = labels.seasonYearLabel(anime);
  const episodes = anime.episodes ? labels.episodeLabel(anime.episodes, anime.type) : null;
  const facts = [labels.typeLabel(anime.type), when, episodes].filter(Boolean) as string[];

  return (
    <div className="flex min-w-0 flex-col duration-300 ease-out lg:animate-in lg:fade-in-0 lg:slide-in-from-bottom-2">
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
        <p className="mt-2 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-foreground/75 lg:mt-3 lg:line-clamp-3 lg:text-sm">{anime.synopsis}</p>
      )}

      <div className="mt-3.5 flex items-center gap-2.5 lg:mt-5">
        <Button asChild size="lg" className="h-11 flex-1 px-6 text-[15px] sm:flex-none">
          <Link to={`${animeHref(anime)}#watch`} viewTransition>
            <PlayIcon className="fill-current" />
            Плеер
          </Link>
        </Button>
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
