import type { AnimeSummary, Genre } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  LayoutGridIcon,
  SparklesIcon,
  StarIcon,
  UserRoundCheckIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { GENRE_ART, patternStyle, tintStyle } from "@/components/anime/genre-art";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";

/**
 * Six genres, all of them on screen at once.
 *
 * It used to be a scrolling row of ten plus an "everything" tile, and the
 * row was the ranking — which meant the fifth genre onward sat half out of
 * view and mostly never got seen. Six fit a phone in two columns of three
 * and a desktop in one row, so every tile is a full tile, and "all genres"
 * becomes a link beside the heading rather than a seventh card competing
 * with the six.
 *
 * Which six is decided by the page (see `useHomeGenres`): the viewer's own
 * taste when there is any to go on, the everyday six otherwise. The
 * subtitle says which of the two it is, so a personalised row never looks
 * like a random one.
 */
export function GenreCards({
  title,
  genres,
  personal,
  label,
  topFor,
  countLabel,
  previewLabel,
}: {
  title: string;
  /** Exactly the tiles to show, in order — at most six. */
  genres: Genre[];
  /** Whether these came from the viewer's own taste. */
  personal: boolean;
  label: (name: string) => string;
  topFor: (genreName: string) => AnimeSummary[];
  countLabel: (count: number) => string;
  previewLabel: string;
}) {
  const t = useT();
  const canHover = useMediaQuery("(hover: hover)");

  if (genres.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--accent-line-soft)] bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]"
            >
              {personal ? <UserRoundCheckIcon className="size-4" /> : <SparklesIcon className="size-4" />}
            </span>
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {personal ? t("home.genresPersonal") : t("home.genresDefault")}
          </p>
        </div>
        <Link
          to="/browse"
          viewTransition
          className="group/all inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:text-primary"
        >
          <LayoutGridIcon className="size-3.5 transition-transform duration-300 group-hover/all:rotate-90" />
          {t("home.allGenres")}
        </Link>
      </div>

      <div className="reveal-group grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {genres.map((genre, i) => (
          <GenreTile
            key={genre.id}
            index={i}
            genre={genre}
            label={label}
            countLabel={countLabel}
            previewLabel={previewLabel}
            picks={canHover ? topFor(genre.name).slice(0, 5) : []}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One shelf, in the site colour: a wash leaning in from a corner, a weave of
 * its own, and its mark oversized and half out of frame. Under the pointer
 * the mark turns and grows, the arrow runs out, and a band of light crosses
 * — three small movements that all say "this opens".
 */
function GenreTile({
  index,
  genre,
  label,
  countLabel,
  previewLabel,
  picks,
}: {
  index: number;
  genre: Genre;
  label: (name: string) => string;
  countLabel: (count: number) => string;
  previewLabel: string;
  picks: AnimeSummary[];
}) {
  const art = GENRE_ART[genre.id];
  const Icon = art?.icon ?? SparklesIcon;

  const tile = (
    <Link
      to={`/browse?genres=${genre.id}`}
      viewTransition
      style={{ "--i": index } as CSSProperties}
      className="reveal group relative flex h-40 flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-card p-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
    >
      {art && (
        <>
          <span aria-hidden className="absolute inset-0" style={tintStyle(art)} />
          <span aria-hidden className="absolute inset-0 opacity-70" style={patternStyle(art)} />
        </>
      )}
      <Icon
        aria-hidden
        strokeWidth={1.25}
        className="absolute -bottom-5 -right-4 size-28 text-foreground/[0.07] transition-all duration-500 ease-out group-hover:-rotate-12 group-hover:scale-110 group-hover:text-primary/15"
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 35%, color-mix(in srgb, var(--card) 70%, transparent) 65%, var(--card) 100%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 translate-x-[420%] -skew-x-12 bg-gradient-to-r from-transparent via-foreground/20 to-transparent transition-transform duration-700 ease-out group-hover:-translate-x-[220%] motion-reduce:hidden"
      />

      <span className="relative flex items-start justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl border border-border/50 bg-background/70 text-foreground backdrop-blur-sm transition-all duration-300 group-hover:border-primary/60 group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-5 transition-transform duration-300 group-hover:scale-110" />
        </span>
        <span className="grid size-7 place-items-center rounded-full border border-border/50 bg-background/70 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-300 -translate-x-1 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100">
          <ArrowRightIcon className="size-3.5" />
        </span>
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
 * What is actually on the shelf: a few titles, each a poster, a name and
 * its score. It answers "is this the genre I mean?" and gets out of the way.
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
          <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-foreground">
            {anime.titleLocalized ?? anime.title}
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

/** The everyday six, in the order a newcomer would reach for them. */
export const DEFAULT_HOME_GENRES = [1, 2, 4, 10, 22, 8] as const;
