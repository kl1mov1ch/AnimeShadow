import type { AnimeSummary, Genre } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  GENRE_ART,
  GENRE_ICONS,
  patternStyle,
  tintStyle,
} from "@/components/anime/genre-art";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Every tile in the row is this wide, at each breakpoint. */
const TILE =
  "w-[calc((100%-2*0.75rem)/2.3)] shrink-0 snap-start sm:w-[calc((100%-3*0.75rem)/3.6)] lg:w-[calc((100%-4*0.75rem)/5.4)]";

/**
 * The one thing a tile does under the pointer: a band of light crossing it
 * from right to left. It starts off the right edge and slides past. Nothing
 * jumps, nothing grows — one transform on one element, which is also the
 * cheapest thing a browser can animate.
 */
const SWEEP =
  "pointer-events-none absolute inset-y-0 left-0 w-1/3 translate-x-[420%] -skew-x-12 bg-gradient-to-r from-transparent via-foreground/20 to-transparent transition-transform duration-700 ease-out will-change-transform group-hover:-translate-x-[220%] motion-reduce:hidden";

/**
 * Genres as one scrolling row, biggest shelf first. Each tile is drawn
 * rather than photographed, in the site colour and nothing else — what
 * separates one from the next is its weave and its mark, not a palette of
 * its own. It says how many titles are behind it and where the click leads,
 * and a hover shows the first few titles it actually holds.
 *
 * One row rather than a grid: the genres are ordered by size, so the row
 * itself is the ranking, and the half-visible tile at the right edge is
 * what tells a visitor there is more to the side.
 */
export function GenreCards({
  title,
  genres,
  label,
  topFor,
  allLabel,
  allNote,
  countLabel,
  openLabel,
  previewLabel,
}: {
  /** The section heading, rendered with the row arrows beside it. */
  title: string;
  genres: Genre[];
  /** Localised genre name. */
  label: (name: string) => string;
  /** A few titles of that genre, from lists the page already loaded. */
  topFor: (genreName: string) => AnimeSummary[];
  /** The last tile: "everything else", i.e. the catalogue. */
  allLabel: string;
  allNote: string;
  /** "128 titles", in the visitor's language. */
  countLabel: (count: number) => string;
  /** The call to action on every tile — says what a click does. */
  openLabel: string;
  /** Heading above the hover list. */
  previewLabel: string;
}) {
  const t = useT();
  const canHover = useMediaQuery("(hover: hover)");
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  if (genres.length === 0) return null;

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  // One "page" of scroll is the visible width, like the anime rows above.
  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/browse" viewTransition>
              {t("common.seeAll")}
            </Link>
          </Button>
          <div className="hidden gap-1 sm:flex">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t("common.previous")}
              disabled={atStart}
              onClick={() => nudge(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t("common.next")}
              disabled={atEnd}
              onClick={() => nudge(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {genres.map((genre) => (
          <GenreTile
            key={genre.id}
            genre={genre}
            label={label}
            countLabel={countLabel}
            openLabel={openLabel}
            previewLabel={previewLabel}
            picks={canHover ? topFor(genre.name).slice(0, 5) : []}
          />
        ))}

        <AllGenresTile label={allLabel} note={allNote} />
      </div>
    </section>
  );
}

/**
 * One shelf, in the site colour: a wash leaning in from a corner, a weave
 * of its own, and its mark oversized and half out of frame.
 */
function GenreTile({
  genre,
  label,
  countLabel,
  openLabel,
  previewLabel,
  picks,
}: {
  genre: Genre;
  label: (name: string) => string;
  countLabel: (count: number) => string;
  openLabel: string;
  previewLabel: string;
  picks: AnimeSummary[];
}) {
  const art = GENRE_ART[genre.id];
  const Icon = art?.icon ?? SparklesIcon;
  const tile = (
    <Link
      to={`/browse?genres=${genre.id}`}
      viewTransition
      className={cn(
        "group relative flex h-44 flex-col justify-end overflow-hidden rounded-2xl border border-border/60 bg-card p-3.5 transition-colors duration-300 hover:border-primary/50",
        TILE,
      )}
    >
      {art && (
        <>
          {/* The wash of the site colour... */}
          <span aria-hidden className="absolute inset-0" style={tintStyle(art)} />
          {/* ...and this genre's own weave over the top. */}
          <span
            aria-hidden
            className="absolute inset-0 opacity-70"
            style={patternStyle(art)}
          />
          {/* The mark of the genre, oversized and half out of frame. */}
          <Icon
            aria-hidden
            className="absolute -bottom-4 -right-3 size-28 text-foreground/[0.07]"
            strokeWidth={1.25}
          />
        </>
      )}
      {/* The card rising from the floor, so the name stays readable in
          either theme. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--card) 70%, transparent) 62%, var(--card) 100%)",
        }}
      />
      <span aria-hidden className={SWEEP} />

      <span className="relative mb-auto flex items-start justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl border border-border/50 bg-background/70 text-foreground backdrop-blur-sm transition-colors duration-300 group-hover:border-primary/60 group-hover:text-primary">
          <Icon className="size-5" />
        </span>
        {/* How big the shelf is, where the eye lands first: it is the
            reason to open one genre before another. */}
        {genre.count != null && genre.count > 0 && (
          <span className="rounded-full border border-border/50 bg-background/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur-sm">
            {genre.count}
          </span>
        )}
      </span>

      <span className="relative">
        <span className="block truncate font-display text-base leading-tight text-foreground">
          {label(genre.name)}
        </span>
        {genre.count != null && genre.count > 0 && (
          <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
            {countLabel(genre.count)}
          </span>
        )}
        {/* Spells out what a click does, so a pretty tile is never mistaken
            for decoration. */}
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          {openLabel}
          <ArrowRightIcon className="size-3 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  );

  if (picks.length === 0) return tile;

  return (
    <HoverCard openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild>{tile}</HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={10} className="w-60 p-2">
        <GenrePreview items={picks} heading={previewLabel} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The way out of the row, and the one tile that is not a single genre — so
 * it wears all of their marks at once, a quiet wall of them behind a solid
 * centre. The wall lights up as the pointer crosses it.
 */
function AllGenresTile({ label, note }: { label: string; note: string }) {
  return (
    <Link
      to="/browse"
      viewTransition
      className={cn(
        "group relative flex h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-border/70 bg-card p-3 text-center transition-colors duration-300 hover:border-primary/60",
        TILE,
      )}
    >
      {/* Every mark in the allow-list, tiled. */}
      <span
        aria-hidden
        className="absolute inset-0 grid grid-cols-4 place-items-center gap-1 p-2 text-foreground opacity-[0.09] transition-opacity duration-500 group-hover:opacity-[0.16]"
      >
        {GENRE_ICONS.map((Icon, i) => (
          <Icon key={i} className="size-6" strokeWidth={1.5} />
        ))}
      </span>
      {/* The site colour pooling under the label, so the middle of the tile
          stays legible over the wall of marks. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 50%, var(--card) 35%, color-mix(in srgb, var(--primary) 16%, transparent) 75%, transparent 100%)",
        }}
      />
      <span aria-hidden className={SWEEP} />

      <span className="relative grid size-10 place-items-center rounded-xl border border-border/60 bg-background/70 text-primary backdrop-blur-sm transition-colors duration-300 group-hover:border-primary/60">
        <LayoutGridIcon className="size-5" />
      </span>
      <span className="relative font-display text-base leading-tight text-foreground">
        {label}
      </span>
      <span className="relative text-[11px] text-muted-foreground">{note}</span>
      <span className="relative inline-flex items-center gap-1 text-[11px] font-medium text-primary">
        <ArrowRightIcon className="size-3 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/**
 * What is actually on the shelf: a few titles, each a poster, a name and
 * its score. Small and quiet on purpose — it answers "is this the genre I
 * mean?" and then gets out of the way.
 */
function GenrePreview({ items, heading }: { items: AnimeSummary[]; heading: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      {items.map((anime) => (
        <Link
          key={anime.id}
          to={animeHref(anime)}
          viewTransition
          className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted/60"
        >
          <span className="h-11 w-8 shrink-0 overflow-hidden rounded bg-muted">
            {anime.imageUrl && (
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-xs leading-snug text-foreground">
              {anime.titleLocalized ?? anime.title}
            </span>
          </span>
          {anime.score != null && (
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
              <StarIcon className="size-3 fill-primary text-primary" />
              {anime.score.toFixed(1)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
