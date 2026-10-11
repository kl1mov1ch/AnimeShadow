import { genreHref } from "@/lib/format";
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
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TrailerButton } from "@/components/anime/trailer-button";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { apiRequest } from "@/lib/api";
import { useSlowConnection } from "@/lib/connection";
import { useT } from "@/i18n";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";

/** Every slide holds for exactly this long. */
const ROTATE_MS = 8_000;

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

/**
 * The homepage hero.
 *
 * One title at a time across the full width: its key visual behind, the
 * pitch on the left, and on the right the queue of titles in the rotation,
 * the current one with a line filling under it.
 *
 * Behind the picture, when the server has one, a short muted clip of the
 * title (see HeroClipService): the picture shows first, and the clip fades
 * in over it only once it is actually playing — never an empty box, never a
 * spinner. Only the slide on screen loads its clip, the phone-sized one on
 * a phone; none at all on a slow connection or for anyone who asked their
 * system for less motion.
 *
 * The rotation is even: every slide gets the same eight seconds, the
 * picture and the text change together in one cross-fade, and nothing
 * moves while the tab is in the background. The next slide's picture is
 * loaded while the current one is up, so a change never shows an empty box.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const hidden = useTabHidden();
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  // Bumped whenever a slide's time starts over (a click, a return to the
  // tab), so its progress line restarts with it.
  const [run, setRun] = useState(0);
  // Pictures that may load: the one on screen and the next — fetched while
  // the current slide plays, so a change of slide never fades in an empty
  // box and then pops the picture in late. (Hidden lazy images used to
  // start loading only once their slide was already showing.)
  const [primed, setPrimed] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  useEffect(() => {
    if (count === 0) return;
    const next = (index + 1) % count;
    setPrimed((prev) => (prev.has(index) && prev.has(next) ? prev : new Set([...prev, index, next])));
  }, [index, count]);

  // Which titles have a clip, and whether this visitor should get one.
  const slow = useSlowConnection();
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 767px)");
  const { data: clips } = useQuery({
    queryKey: ["hero-clips"],
    enabled: !slow && !calm,
    queryFn: ({ signal }) => apiRequest<HeroClips>("/hero-clips", { signal }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (count < 2 || hidden) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [count, index, run, hidden]);


  if (count === 0) return null;

  const current = slides[index] ?? slides[0]!;
  const go = (next: number) => {
    setIndex(((next % count) + count) % count);
    setRun((r) => r + 1);
  };
  const title = labels.title(current);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      className="full-bleed relative isolate overflow-hidden border-b border-border/50 bg-card outline-none"
    >
      {/* Every slide's picture, once loaded, stays mounted
          and cross-fades, so a change of slide dissolves rather than cuts. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {slides.map((slide, i) => {
          const art = imageSrc(slide.bannerImage ?? fullSizeCover(slide.imageLargeUrl ?? slide.imageUrl));
          const on = i === index;
          return (
            <div
              key={slide.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                on ? "opacity-100" : "opacity-0",
              )}
            >
              {art && primed.has(i) && (
                <img
                  src={art}
                  alt=""
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"}
                  className={cn("absolute inset-0 size-full object-cover object-center", on && "home-kenburns")}
                />
              )}
              {on && !hidden && clips?.[String(slide.id)] && (
                <HeroClip src={narrow ? clips[String(slide.id)]!.sd : clips[String(slide.id)]!.hd} />
              )}
            </div>
          );
        })}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/20 sm:via-background/35" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background/95 via-background/60 to-transparent sm:block" />
      </div>

      <div className="mx-auto grid w-full max-w-[1400px] items-end gap-8 px-4 pb-6 pt-14 sm:px-6 sm:pt-20 lg:min-h-[min(78vh,38rem)] lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center lg:gap-14 lg:py-16">
        <SlidePitch key={current.id} anime={current} title={title} />
        {count > 1 && <SlideQueue slides={slides} index={index} run={`${index}-${run}-${hidden}`} onPick={go} label={(a) => labels.title(a)} />}
      </div>

      {count > 1 && (
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 pb-6 sm:px-6">
          <HeroArrow label={t("common.previous")} onClick={() => go(index - 1)}>
            <ChevronLeftIcon className="size-4" />
          </HeroArrow>
          {/* One segment per slide; the current one fills over its eight seconds. */}
          <div className="flex flex-1 items-center gap-1.5 sm:max-w-xs">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(i)}
                aria-label={labels.title(slide)}
                className="group relative h-6 flex-1"
              >
                <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15 transition-colors group-hover:bg-foreground/25">
                  {i < index && <span className="absolute inset-0 bg-foreground/50" />}
                  {i === index && (
                    <span
                      key={`${index}-${run}-${hidden}`}
                      className={cn("absolute inset-0 origin-left bg-primary", hidden ? "scale-x-0" : "hero-progress")}
                      style={{ animationDuration: `${ROTATE_MS}ms` }}
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
      )}
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
        "absolute inset-0 size-full object-cover object-center transition-opacity duration-1000 ease-out",
        playing ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * The left half: what the title is and what to do with it. Keyed on the
 * slide by its parent, so the whole block fades in as one piece each time
 * the slide changes.
 */
function SlidePitch({ anime, title }: { anime: AnimeDetail; title: string }) {
  const t = useT();
  const labels = useLabels();
  const when = labels.seasonYearLabel(anime);
  const episodes = anime.episodes ? labels.episodeLabel(anime.episodes, anime.type) : null;
  const facts = [labels.typeLabel(anime.type), when, episodes].filter(Boolean) as string[];

  return (
    <div className="min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-700 ease-out">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
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
        <span className="text-foreground/75">{facts.join(" · ")}</span>
      </div>

      <h2 className="mt-4 line-clamp-2 font-display text-3xl leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
        <Link to={animeHref(anime)} viewTransition className="transition-colors duration-300 hover:text-foreground/80">
          {title}
        </Link>
      </h2>

      {anime.genresDetailed.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {anime.genresDetailed.slice(0, 4).map((genre) => (
            <Link
              key={genre.id}
              to={genreHref(genre.name)}
              viewTransition
              className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-foreground/85 transition-colors hover:border-white/30 hover:text-foreground"
            >
              {labels.genreLabel(genre.name)}
            </Link>
          ))}
        </div>
      )}

      {anime.synopsis && (
        <p className="mt-4 line-clamp-2 max-w-2xl text-sm leading-relaxed text-foreground/80 sm:line-clamp-3 sm:text-[15px]">
          {anime.synopsis}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
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

/**
 * The rotation as a queue: every title in it with its poster and name, the
 * current one lit. On a phone it becomes a strip under the pitch.
 */
function SlideQueue({
  slides,
  index,
  run,
  onPick,
  label,
}: {
  slides: AnimeDetail[];
  index: number;
  run: string;
  onPick: (i: number) => void;
  label: (anime: AnimeDetail) => string;
}) {
  return (
    <ol className="-mx-4 hidden gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {slides.map((slide, i) => {
        const active = i === index;
        return (
          <li key={slide.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={active}
              aria-label={label(slide)}
              className={cn(
                "group/q relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-1.5 pr-3 text-left transition-[background-color,border-color] duration-500",
                active
                  ? "border-white/15 bg-black/45"
                  : "border-transparent bg-black/20 hover:border-white/10 hover:bg-black/35",
              )}
            >
              <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                {slide.imageUrl && (
                  <img
                    src={imageSrc(slide.imageUrl)}
                    alt=""
                    loading="lazy"
                    className={cn("size-full object-cover transition-opacity duration-500", !active && "opacity-60 group-hover/q:opacity-90")}
                  />
                )}
              </span>
              <span
                className={cn(
                  "line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-snug transition-colors duration-500",
                  active ? "text-foreground" : "text-foreground/60 group-hover/q:text-foreground/85",
                )}
              >
                {label(slide)}
              </span>
              {active && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground/10">
                  <span key={run} className="hero-progress absolute inset-0 origin-left bg-primary" style={{ animationDuration: `${ROTATE_MS}ms` }} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function HeroArrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/30 text-foreground/80 transition-colors duration-200 hover:border-white/30 hover:bg-black/45 hover:text-foreground active:scale-95"
    >
      {children}
    </button>
  );
}

/** The hero's own placeholder, the same shape and full width. */
export function SpotlightHeroSkeleton() {
  return (
    <section className="full-bleed border-b border-border/50 bg-card">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-8 px-4 pb-8 pt-14 sm:px-6 sm:pt-20 lg:min-h-[min(78vh,38rem)] lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-14 w-3/4" />
          <Skeleton className="h-6 w-64 rounded-full" />
          <Skeleton className="h-12 w-full max-w-2xl" />
          <Skeleton className="h-11 w-56 rounded-lg" />
        </div>
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[4.25rem] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </section>
  );
}
