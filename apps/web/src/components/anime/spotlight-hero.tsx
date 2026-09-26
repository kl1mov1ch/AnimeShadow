import type { AnimeDetail } from "@animeshadow/shared";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListVideoIcon,
  PlayIcon,
  StarIcon,
  TrendingUpIcon,
  TvIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { OpeningVideo } from "@/components/anime/opening-video";
import { TrailerButton } from "@/components/anime/trailer-button";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useSlowConnection } from "@/lib/connection";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";

/** A slide holds for this long before the next one. */
const ROTATE_MS = 9_000;
/** A beat after a slide settles before its opening is even requested. */
const VIDEO_DELAY_MS = 1_500;

/**
 * The homepage hero.
 *
 * One title at a time across the full width of the window: its key visual
 * behind, drifting slowly, its opening over that once the slide settles, the
 * pitch on the left. On the right, instead of a row of anonymous dots, the
 * queue itself — every title in the rotation as a poster with its name, the
 * one on screen lit and filling as its time runs out — so you can see what
 * is coming and jump to it, not just that there are six of something.
 *
 * It turns itself, always — the line under the current thumbnail fills
 * as its time runs out. It used to stop while the pointer was over it,
 * which on this page is most of the time, so the line just sat there full
 * and nothing moved. The arrows and the keys still step through it.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const slow = useSlowConnection();
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [wantsVideo, setWantsVideo] = useState(false);

  useEffect(() => {
    if (count < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [count, index]);

  useEffect(() => {
    setWantsVideo(false);
    const timer = setTimeout(() => setWantsVideo(true), VIDEO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [index]);

  if (count === 0) return null;

  const current = slides[index] ?? slides[0]!;
  const step = (direction: 1 | -1) => setIndex((i) => (i + direction + count) % count);
  const title = labels.title(current);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      }}
      className="full-bleed relative isolate overflow-hidden border-b border-border/60 bg-card outline-none"
    >
      {/* Every slide's art stays mounted and cross-fades, so changing slides
          dissolves rather than blinks; the one on screen drifts slowly. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {slides.map((slide, i) => {
          const art = imageSrc(
            slide.bannerImage ?? fullSizeCover(slide.imageLargeUrl ?? slide.imageUrl),
          );
          if (!art) return null;
          return (
            <img
              key={slide.id}
              src={art}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "low"}
              className={cn(
                "absolute inset-0 size-full object-cover object-center transition-opacity duration-1000",
                i === index ? "home-kenburns opacity-100" : "opacity-0",
              )}
            />
          );
        })}
        {!slow && (
          <OpeningVideo
            animeId={current.id}
            active={wantsVideo}
            className="absolute inset-0"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/25 sm:via-background/40" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background via-background/70 to-transparent sm:block" />
        {/* The site colour pooling in the lower corner, so the hero belongs
            to AnimeShadow whatever the art behind it happens to be. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 70% at 0% 100%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%)",
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-[1400px] items-end gap-8 px-4 pb-8 pt-12 sm:px-6 sm:pt-16 lg:min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-12 lg:py-16">
        <SlidePitch key={current.id} anime={current} rank={index + 1} title={title} />

        {count > 1 && (
          <SlideQueue
            slides={slides}
            index={index}
            onPick={setIndex}
            label={(a) => labels.title(a)}
          />
        )}
      </div>

      {count > 1 && (
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2 px-4 pb-6 sm:px-6">
          <HeroControl label={t("common.previous")} onClick={() => step(-1)}>
            <ChevronLeftIcon className="size-4" />
          </HeroControl>
          <HeroControl label={t("common.next")} onClick={() => step(1)}>
            <ChevronRightIcon className="size-4" />
          </HeroControl>
          <span className="ml-2 font-display text-xs tabular-nums text-muted-foreground">
            <span className="text-foreground">{String(index + 1).padStart(2, "0")}</span>
            {" / "}
            {String(count).padStart(2, "0")}
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * The left half: what the title is and what to do with it. Keyed on the
 * slide by its parent, so every piece replays its entrance, one after the
 * other, each time the slide changes.
 */
function SlidePitch({
  anime,
  rank,
  title,
}: {
  anime: AnimeDetail;
  rank: number;
  title: string;
}) {
  const t = useT();
  const labels = useLabels();

  const facts = [
    anime.score != null
      ? { icon: StarIcon, value: anime.score.toFixed(1), hint: t("detail.scoreHintBare"), star: true }
      : null,
    labels.seasonYearLabel(anime)
      ? { icon: CalendarIcon, value: labels.seasonYearLabel(anime)!, hint: t("detail.facts.aired") }
      : null,
    { icon: TvIcon, value: labels.typeLabel(anime.type), hint: t("detail.facts.format") },
    anime.episodes
      ? {
          icon: ListVideoIcon,
          value: labels.episodeLabel(anime.episodes, anime.type)!,
          hint: t("detail.facts.episodes"),
        }
      : null,
  ].filter((f): f is NonNullable<typeof f> => f != null && Boolean(f.value));

  const stagger = (i: number) =>
    ({ animationDelay: `${i * 90}ms`, animationFillMode: "both" }) as CSSProperties;

  return (
    <div className="min-w-0">
      <div
        style={stagger(0)}
        className="flex animate-in flex-wrap items-center gap-2 fade-in slide-in-from-bottom-2 duration-500"
      >
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <TrendingUpIcon className="size-3.5" />
          {t("home.heroRank", { rank })}
        </span>
        {anime.airing === "AIRING" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            {labels.airingLabel(anime.airing)}
          </span>
        )}
      </div>

      <h2
        style={stagger(1)}
        className="mt-4 line-clamp-2 animate-in font-display text-3xl leading-[1.05] text-foreground fade-in slide-in-from-bottom-3 duration-700 sm:text-5xl lg:text-6xl"
      >
        <Link to={animeHref(anime)} viewTransition className="transition-colors hover:text-primary">
          {title}
        </Link>
      </h2>

      <div
        style={stagger(2)}
        className="mt-4 flex animate-in flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground fade-in slide-in-from-bottom-2 duration-500"
      >
        {facts.map(({ icon: Icon, value, hint, star }) => (
          <Tooltip key={hint}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex cursor-default items-center gap-1.5",
                  star && "font-semibold text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    star ? "fill-amber-400 text-amber-400" : "text-[var(--accent-ink)]",
                  )}
                />
                {value}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{hint}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {anime.genresDetailed.length > 0 && (
        <div
          style={stagger(3)}
          className="mt-3 flex animate-in flex-wrap gap-1.5 fade-in slide-in-from-bottom-2 duration-500"
        >
          {anime.genresDetailed.slice(0, 4).map((genre) => (
            <Link
              key={genre.id}
              to={`/browse?genres=${genre.id}`}
              viewTransition
              className="rounded-lg border border-border/60 bg-background/92 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {labels.genreLabel(genre.name)}
            </Link>
          ))}
        </div>
      )}

      {anime.synopsis && (
        <p
          style={stagger(4)}
          className="mt-4 line-clamp-3 max-w-2xl animate-in text-sm leading-relaxed text-foreground/75 fade-in slide-in-from-bottom-2 duration-500"
        >
          {anime.synopsis}
        </p>
      )}

      <div
        style={stagger(5)}
        className="mt-6 flex animate-in flex-wrap items-center gap-2.5 fade-in slide-in-from-bottom-2 duration-500"
      >
        <Button asChild size="lg" className="shadow-lg shadow-primary/25">
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
        onSuccess: () =>
          toast.success(t("library.savedStatus", { title, status: t("status.PLANNED") })),
        onError: () => toast.error(t("library.saveError")),
      },
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={keep}
          disabled={upsert.isPending}
          aria-label={kept ? t("card.inList") : t("card.addToList")}
          className={cn(
            "grid size-10 place-items-center rounded-lg border transition-all duration-200 active:scale-90",
            kept
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border/60 bg-background/60 text-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          <MorphIcon on={kept} off={BookmarkPlusIcon} onIcon={BookmarkCheckIcon} className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{kept ? t("card.inList") : t("card.addToList")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The rotation as a queue of posters. The one on screen is lit, with a bar
 * filling along its bottom edge as its time runs out; the bar stops when
 * the hero is paused. On a phone it becomes a strip under the pitch.
 */
function SlideQueue({
  slides,
  index,
  onPick,
  label,
}: {
  slides: AnimeDetail[];
  index: number;
  onPick: (i: number) => void;
  label: (anime: AnimeDetail) => string;
}) {
  return (
    <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {slides.map((slide, i) => {
        const active = i === index;
        return (
          <li key={slide.id} className="shrink-0 lg:shrink">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={active}
              aria-label={label(slide)}
              className={cn(
                "group/q relative flex w-44 items-center gap-2.5 overflow-hidden rounded-xl border p-1.5 pr-3 text-left transition-all duration-300 lg:w-full",
                active
                  ? "slide-glow border-primary/20 bg-background/85"
                  : "border-border/50 bg-background/45 hover:border-primary/40 hover:bg-background/70",
              )}
              style={active ? ({ "--slide-dur": `${ROTATE_MS}ms` } as React.CSSProperties) : undefined}
              // Restart the ring and the glow on every new slide.
              key={active ? `on-${index}` : "off"}
            >
              {/* The time left on this slide, drawn as the card's border
                  filling in clockwise, with a glow that grows behind it. */}
              {active && <span aria-hidden className="slide-ring pointer-events-none absolute inset-0 z-10 rounded-[inherit]" />}
              <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                {slide.imageUrl && (
                  <img
                    src={imageSrc(slide.imageUrl)}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "size-full object-cover transition-transform duration-500 group-hover/q:scale-110",
                      !active && "opacity-70",
                    )}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[10px] tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 text-xs font-medium leading-snug transition-colors",
                    active ? "text-foreground" : "text-muted-foreground group-hover/q:text-foreground",
                  )}
                >
                  {label(slide)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function HeroControl({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            "btn-sheen grid size-9 shrink-0 place-items-center rounded-lg border transition-all duration-200 active:scale-90",
            pressed
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border/60 bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The hero's own placeholder, the same shape and full width. */
export function SpotlightHeroSkeleton() {
  return (
    <section className="full-bleed border-b border-border/60 bg-card">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-8 px-4 pb-8 pt-12 sm:px-6 sm:pt-16 lg:min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-14 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full max-w-2xl" />
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
