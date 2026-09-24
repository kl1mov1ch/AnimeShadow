import type { AnimeDetail } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  PlayIcon,
  StarIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OpeningVideo } from "@/components/anime/opening-video";
import { TrailerButton } from "@/components/anime/trailer-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useSlowConnection } from "@/lib/connection";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** A slide holds for this long before the next one. */
const ROTATE_MS = 20_000;
/** A beat after a slide settles before its opening is even requested. */
const VIDEO_DELAY_MS = 1_500;

/** "PG-13 - Teens 13 or older" / "r_plus" → "PG-13" / "R+". */
function shortRating(rating: string | null): string | null {
  const head = rating?.split(" - ")[0]?.trim();
  if (!head) return null;
  return head.replace(/_plus$/i, "+").replace(/_/g, "-").toUpperCase();
}

/**
 * The homepage hero: one title at a time across the full width of the
 * window, its own key visual behind it and its opening playing over that,
 * the pitch on the left and a panel of facts on the right. It turns itself
 * every 20 seconds; the arrows and dots under it are for going faster.
 *
 * Everything is drawn in the site's own tokens, so it follows the light and
 * dark themes with the rest of the page, and it sits flush against the
 * sections above and below — full-bleed, square corners, one hairline top
 * and bottom, no gap for the page's gutters to show through.
 */
export function SpotlightHero({ items }: { items: AnimeDetail[] }) {
  const t = useT();
  const labels = useLabels();
  const slow = useSlowConnection();
  const slides = items.slice(0, 6);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wantsVideo, setWantsVideo] = useState(false);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  useEffect(() => {
    setWantsVideo(false);
    const timer = setTimeout(() => setWantsVideo(true), VIDEO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [index]);

  if (count === 0) return null;

  const current = slides[index] ?? slides[0]!;
  const step = (direction: 1 | -1) => setIndex((i) => (i + direction + count) % count);
  const title = labels.title(current);
  const nextEpisode = current.nextEpisode
    ? `${current.nextEpisode.episode} · ${new Date(current.nextEpisode.airingAt).toLocaleDateString(
        labels.locale,
        { day: "numeric", month: "short" },
      )}`
    : null;
  const meta = [
    labels.typeLabel(current.type),
    labels.seasonYearLabel(current),
    labels.episodeLabel(current.episodes, current.type),
    shortRating(current.rating),
  ].filter(Boolean);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      className="full-bleed relative isolate overflow-hidden border-y border-border/60 bg-card"
    >
      {/* Every slide's art stays mounted and cross-fades, so changing slides
          dissolves rather than blinks. */}
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
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          );
        })}
        {/* The show itself, over the still — it refuses on a touch device or
            a metered connection, so this is an upgrade or nothing. */}
        {!slow && <OpeningVideo animeId={current.id} active={wantsVideo && !paused} className="absolute inset-0" />}

        {/* Legibility, in whichever theme is on: the page's own background
            colour, faded across the art. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 sm:via-background/45" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background via-background/75 to-transparent sm:block" />
      </div>

      <div className="mx-auto grid w-full max-w-[1400px] items-end gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-center lg:gap-10 lg:py-16">
        {/* Keyed on the slide, so the text replays its entrance each time. */}
        <div key={current.id} className="animate-in fade-in slide-in-from-bottom-3 min-w-0 duration-700">
          <h2 className="line-clamp-2 font-display text-3xl leading-tight text-foreground sm:text-4xl lg:text-5xl">
            <Link to={animeHref(current)} className="transition-colors hover:text-primary">
              {title}
            </Link>
          </h2>

          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {current.score != null && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <StarIcon className="size-3.5 fill-primary text-primary" />
                {current.score.toFixed(1)}
              </span>
            )}
            {meta.map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-2">
                {(i > 0 || current.score != null) && (
                  <span aria-hidden className="size-1 rounded-full bg-muted-foreground/40" />
                )}
                {item}
              </span>
            ))}
          </p>

          {current.synopsis && (
            <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {current.synopsis}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Button asChild size="lg" className="group/btn relative overflow-hidden">
              <Link to={animeHref(current)}>
                <PlayIcon className="fill-current" />
                {t("discover.viewDetails")}
                <Shine />
              </Link>
            </Button>
            <TrailerButton url={current.trailerEmbedUrl} title={title} />
          </div>
        </div>

        {/* The facts, in their own panel — on wide screens beside the pitch,
            on a phone under it. */}
        {/* The panel beside the slide, kept to what is worth knowing at a
            glance: how long the thing is, how long one episode takes, and
            when the next one lands. Format, status and studio are on the
            title page for anyone who wants them. */}
        <aside
          key={`facts-${current.id}`}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          className="animate-in fade-in slide-in-from-right-4 flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-4 shadow-xl shadow-black/10 backdrop-blur-md duration-700"
        >
          <div className="flex items-center gap-3">
            <span className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
              {current.imageUrl && (
                <img
                  src={imageSrc(current.imageLargeUrl ?? current.imageUrl)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 text-sm font-semibold text-foreground">{title}</span>
              {current.score != null && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <StarIcon className="size-3 fill-primary text-primary" />
                  <span className="font-medium text-foreground">{current.score.toFixed(1)}</span>
                </span>
              )}
            </span>
          </div>

          <dl className="flex flex-col gap-1.5 border-t border-border/60 pt-3 text-xs">
            <Fact
              label={t("detail.facts.episodes")}
              value={labels.episodeLabel(current.episodes, current.type)}
            />
            <Fact label={t("detail.facts.duration")} value={current.duration} />
            <Fact label={t("watch.nextEpisode")} value={nextEpisode} />
          </dl>

          {current.genresDetailed.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
              {current.genresDetailed.slice(0, 3).map((genre) => (
                <Link
                  key={genre.id}
                  to={`/browse?genres=${genre.id}`}
                  viewTransition
                  className="rounded-lg border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {labels.genreLabel(genre.name)}
                </Link>
              ))}
            </div>
          )}

          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to={animeHref(current)} viewTransition>
              <ClapperboardIcon />
              {t("discover.viewDetails")}
            </Link>
          </Button>
        </aside>
      </div>

      {/* Controls, centred under the slide: an arrow either side of the
          dots, and the active dot fills while its slide is on screen. */}
      {count > 1 && (
        <div className="relative flex items-center justify-center gap-3 pb-6">
          <StepButton label={t("common.previous")} onClick={() => step(-1)}>
            <ChevronLeftIcon className="size-4" />
          </StepButton>

          <div
            className="flex items-center gap-2"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={labels.title(slide)}
                aria-current={i === index}
                className="group/dot h-1.5 rounded-lg transition-all duration-500"
                style={{ width: i === index ? 44 : 10 }}
              >
                <span className="block h-full w-full overflow-hidden rounded-full bg-foreground/20 transition-colors group-hover/dot:bg-foreground/40">
                  {i === index && (
                    <span
                      key={`${index}-${paused}`}
                      className="block h-full rounded-full bg-primary"
                      style={{
                        animation: paused
                          ? "none"
                          : `home-slide-progress ${ROTATE_MS}ms linear forwards`,
                        width: paused ? "100%" : undefined,
                      }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>

          <StepButton label={t("common.next")} onClick={() => step(1)}>
            <ChevronRightIcon className="size-4" />
          </StepButton>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group/btn relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-background/70 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-foreground active:scale-95"
    >
      <span className="relative z-10">{children}</span>
      <Shine />
    </button>
  );
}

/** The hero's own placeholder, the same shape and full width. */
export function SpotlightHeroSkeleton() {
  return (
    <section className="full-bleed border-y border-border/60 bg-card">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full max-w-2xl" />
          <Skeleton className="h-11 w-48 rounded-full" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </section>
  );
}

/**
 * The band of white light that crosses a button when it is hovered — the
 * same sweep the rest of the site's calls to action use.
 */
function Shine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[250%] -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover/btn:translate-x-[420%] motion-reduce:hidden"
    />
  );
}
