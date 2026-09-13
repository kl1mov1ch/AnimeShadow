import type { AnimeDetail, Character } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AnimeCard } from "@/components/anime/anime-card";
import { CharacterCard } from "@/components/anime/character-card";
import { CharacterModal } from "@/components/anime/character-modal";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { CommentsSection } from "@/components/comments/comments-section";
import { LibraryControls } from "@/components/anime/library-controls";
import { NextEpisodeBadge } from "@/components/anime/next-episode-badge";
import { ReviewsSection } from "@/components/anime/reviews-section";
import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { WatchSection } from "@/components/anime/watch-section";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShareButtons } from "@/components/seo/share-buttons";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useAnime, useAnimeProgress, useCharacters, useSimilarAnime } from "@/lib/query";
import { animeUrl, useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export function Component() {
  const t = useT();
  const { id } = useParams();

  // Accepts a numeric id ("/anime/1535") or a slug ("/anime/death-note").
  if (!id || !/^[\w-]+$/.test(id)) {
    return (
      <ErrorState title={t("detail.notValid")} message={t("detail.notValidBody")} />
    );
  }
  return <AnimeDetailView param={id} />;
}

function AnimeDetailView({ param }: { param: string }) {
  const t = useT();
  const labels = useLabels();
  const { data, isPending, isError, error, refetch } = useAnime(param);
  // Lifted here (not inside WatchSection) so the Episodes section below the
  // player can jump it to any episode without threading a ref through. Must
  // sit above every early return below — hooks can't be conditional.
  const [episode, setEpisode] = useState(1);
  // The route component isn't remounted when navigating from one anime page
  // to another (same route, different :id) — reset explicitly, or the new
  // title would open on whatever episode number the last one left behind.
  useEffect(() => {
    setEpisode(1);
  }, [data?.id]);

  const seoTitle = data ? labels.title(data) : "AnimeShadow";
  useDocumentHead(
    data
      ? {
          title: t("seo.titleTemplate", { title: seoTitle }),
          description: t("seo.descriptionTemplate", {
            title: seoTitle,
            type: labels.typeLabel(data.type),
            year: data.year ?? "—",
            score: data.score != null ? data.score.toFixed(2) : "—",
            genres: data.genresDetailed
              .slice(0, 3)
              .map((g) => labels.genreLabel(g.name))
              .join(", "),
          }),
          image: data.imageLargeUrl ?? data.imageUrl,
          path: animeUrl(data),
          type: "video.tv_show",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "TVSeries",
            name: seoTitle,
            image: data.imageLargeUrl ?? data.imageUrl ?? undefined,
            description: data.synopsis ?? undefined,
            numberOfEpisodes: data.episodes ?? undefined,
            genre: data.genresDetailed.map((g) => g.name),
            ...(data.score != null && data.scoredBy != null
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: data.score,
                    ratingCount: data.scoredBy,
                    bestRating: 10,
                  },
                }
              : {}),
          },
        }
      : { title: "AnimeShadow" },
  );

  if (isPending) return <DetailSkeleton />;

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    const ageGated =
      error instanceof ApiRequestError && error.code === "AGE_VERIFICATION_REQUIRED";
    if (ageGated) return <AdultContentGate />;
    return (
      <ErrorState
        title={notFound ? t("detail.notFound") : t("detail.loadError")}
        message={notFound ? t("detail.notFoundBody") : t("detail.loadErrorBody")}
        onRetry={notFound ? undefined : () => void refetch()}
      />
    );
  }

  const title = labels.title(data);
  const hasWideArt = Boolean(data.bannerImage || data.screenshots[0]);
  const banner = imageSrc(
    data.bannerImage ?? data.screenshots[0] ?? data.imageLargeUrl ?? data.imageUrl,
  );
  const poster = imageSrc(data.imageLargeUrl ?? data.imageUrl);
  const secondaryTitle =
    data.titleJapanese && data.titleJapanese !== title ? data.titleJapanese : null;
  const oneLiner = t("detail.oneLiner", {
    type: labels.typeLabel(data.type),
    year: data.year ?? "—",
    genres: data.genresDetailed
      .slice(0, 3)
      .map((g) => labels.genreLabel(g.name))
      .join(", "),
  });

  return (
    <article className="flex flex-col gap-6">
      <CinematicHeader
        src={banner}
        isPortraitFallback={!hasWideArt}
        title={title}
        seed={data.id}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="text-primary">{labels.airingLabel(data.airing)}</span>
            <Dot />
            <span>{labels.typeLabel(data.type)}</span>
            {labels.seasonYearLabel(data) && (
              <>
                <Dot />
                <span>{labels.seasonYearLabel(data)}</span>
              </>
            )}
            {data.rating && (
              <>
                <Dot />
                <span>{data.rating}</span>
              </>
            )}
          </div>
          <ShareButtons path={animeUrl(data)} />
        </div>

        {/* Poster alongside everything else, not stacked in a separate
            sidebar below — the header is the one place all of a title's
            identity (art, name, rating, genres, actions) lives together.
            Top-aligned (not bottom-) so the title sits right under the meta
            line above it instead of trailing down to the poster's bottom
            edge, leaving a gap between the two. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto w-28 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted shadow-lg sm:mx-0 sm:w-36 lg:w-40">
            <PosterImage src={poster} title={title} seed={data.id} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl leading-tight text-foreground sm:text-4xl">
                {title}
              </h1>
              {secondaryTitle && (
                <p className="text-sm text-muted-foreground">{secondaryTitle}</p>
              )}
            </div>

            {data.nextEpisode && (
              <NextEpisodeBadge
                episode={data.nextEpisode.episode}
                airingAt={data.nextEpisode.airingAt}
              />
            )}

            {/* Rating — exactly that, nothing else: score, vote count, rank. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <ScoreBadge score={data.score} size="md" />
              {data.scoredBy != null && (
                <span>{t("common.ratings", { count: labels.compact(data.scoredBy) })}</span>
              )}
              {data.rank != null && data.rank > 0 && (
                <span className="tabular-nums">{t("detail.ranked", { rank: data.rank })}</span>
              )}
              {data.translated && (
                <Badge variant="outline" className="text-[11px]">
                  {t("detail.machineTranslated")}
                </Badge>
              )}
            </div>

            {data.genresDetailed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.genresDetailed.slice(0, 10).map((genre) => (
                  <Link key={genre.id} to={`/browse?genres=${genre.id}`}>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer font-normal transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {labels.genreLabel(genre.name)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <LibraryControls animeId={data.id} title={title} />
              <TrailerButton url={data.trailerEmbedUrl} title={title} />
            </div>
          </div>
        </div>
      </CinematicHeader>

      {/* One continuous surface, hairline-separated sections — no more
          poster sidebar, since the header above already carries it. */}
      <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <Block title={t("detail.sections.watch")}>
          <WatchSection
            anime={data}
            title={title}
            active
            episode={episode}
            onEpisodeChange={setEpisode}
          />
        </Block>

        <EpisodesSection
          animeId={data.id}
          episodesTotal={data.episodes}
          currentEpisode={episode}
          onSelect={setEpisode}
        />

        <OverviewBlock anime={data} oneLiner={oneLiner} />

        <CharactersBlock animeId={data.id} />

        <div className="p-5">
          <ReviewsSection animeId={data.id} active />
        </div>

        <div className="p-5">
          <CommentsSection animeId={data.id} />
        </div>
      </div>

      <RelatedSection anime={data} />
    </article>
  );
}

/* ---------------- pieces ---------------- */

/**
 * A bounded banner strip, not a page-wide effect — the title's own key
 * visual (or its best available stand-in), full width, fading into the
 * page background at the bottom. Replaces the old full-page drifting-orb
 * ambient wash: one deliberate image instead of a layered glow effect.
 */
function CinematicHeader({
  src,
  /** True when `src` is a tall poster crop, not a real wide banner/screenshot
   * — stretching a poster edge-to-edge with `object-cover` zooms into a tiny
   * sliver of it (usually just its decorative background pattern) and reads
   * as broken. Toned down to a soft, gently-scaled backdrop instead of trying
   * to feature the poster twice — the sharp copy already sits in the info
   * panel below, this is purely atmospheric colour. */
  isPortraitFallback,
  title,
  seed,
  children,
}: {
  src: string | undefined;
  isPortraitFallback: boolean;
  title: string;
  seed: number;
  children: React.ReactNode;
}) {
  return (
    // No height of its own — the card below drives it (via the in-flow
    // content wrapper's min-h), so the photo never runs on past where the
    // actual content ends. That gap was the "empty space" here: a box
    // forced to a fixed 360/420px tall regardless of how short the info
    // card actually was.
    <div className="relative w-full overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="pointer-events-none absolute inset-0">
        {src ? (
          <img
            src={src}
            alt=""
            aria-hidden
            fetchPriority="high"
            // Static — no pan/zoom here. The slow-scale animation used on the
            // homepage spotlight pushes a banner past 100% size, which softens
            // it noticeably on a wide desktop viewport; a detail page banner
            // is shown far longer than a rotating slide; it should stay sharp.
            className={cn(
              "absolute inset-0 size-full object-cover",
              isPortraitFallback && "scale-110 object-top opacity-50 blur-3xl saturate-50",
            )}
          />
        ) : (
          <PosterFallback title={title} seed={seed} />
        )}
        {/* One even fade across the whole photo, not just its bottom two
            thirds — the old hard-edged patch under the card was what read as
            "too dark"; a gentler, full-height gradient gives the same text
            legibility without crushing the rest of the image. Ends in a
            plain transparent, never a tinted stop — `via-card` on a light
            theme is a near-white colour, so anything but fully transparent
            up top reads as a washed-out glare across the image instead of a
            fade. */}
        <div className="absolute inset-0 bg-gradient-to-t from-card/85 via-card/30 to-transparent" />
      </div>
      <div className="relative flex min-h-[260px] flex-col justify-end p-4 sm:min-h-[300px] sm:p-6">
        {/* Everything the viewer needs to read or click sits on its own
            panel — lighter than before so the photo still reads through it,
            while staying solid enough to keep text legible over busy art. */}
        <div className="flex flex-col gap-3 rounded-xl bg-background/45 p-4 shadow-lg backdrop-blur-md sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="size-1 rounded-full bg-muted-foreground/40" />;
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}

function PosterImage({
  src,
  title,
  seed,
}: {
  src: string | undefined;
  title: string;
  seed: number;
}) {
  if (!src) {
    return (
      <div className="aspect-[2/3]">
        <PosterFallback title={title} seed={seed} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className="aspect-[2/3] size-full object-cover"
      fetchPriority="high"
    />
  );
}

// Halved along with the 3-line clamp below — kept in proportion so "show
// more" still reliably appears whenever the shorter clamp actually truncates
// something, instead of leaving a cut-off synopsis with no way to expand it.
const SYNOPSIS_CLAMP_AT = 260;

function SynopsisBody({
  synopsis,
  background,
}: {
  synopsis: string | null;
  background: string | null;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const long = (synopsis?.length ?? 0) > SYNOPSIS_CLAMP_AT || Boolean(background);

  return (
    <div className="flex flex-col gap-3">
      {synopsis && (
        <p
          className={cn(
            "whitespace-pre-line leading-relaxed text-foreground/90",
            !expanded && "line-clamp-3",
          )}
        >
          {synopsis}
        </p>
      )}
      {expanded && background && (
        <p className="text-sm leading-relaxed text-muted-foreground">{background}</p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  );
}

/**
 * One "Overview" section instead of three separate blocks (synopsis / themes
 * / a tall facts sidebar) — the synopsis leads, thematic tags and the fact
 * strip follow underneath at a lower visual weight, so the section reads as
 * one coherent "everything about the show" surface rather than a stack of
 * competing boxes.
 */
function OverviewBlock({ anime, oneLiner }: { anime: AnimeDetail; oneLiner: string }) {
  const t = useT();
  const labels = useLabels();
  const hasSynopsis = Boolean(anime.synopsis || anime.background);
  const hasThemes = anime.themes.length > 0 || anime.demographics.length > 0;

  const facts = (
    [
      [t("detail.facts.format"), labels.typeLabel(anime.type)],
      [t("detail.facts.status"), labels.airingLabel(anime.airing)],
      [t("detail.facts.episodes"), anime.episodes ? String(anime.episodes) : null],
      [t("detail.facts.aired"), labels.formatDate(anime.airedFrom)],
      [t("detail.facts.ended"), labels.formatDate(anime.airedTo)],
      [t("detail.facts.season"), labels.seasonYearLabel(anime)],
      [t("detail.facts.duration"), anime.duration],
      [t("detail.facts.rating"), anime.rating],
      [
        t("detail.facts.studios"),
        anime.studios.length > 0 ? (
          <span className="flex flex-wrap justify-end gap-x-3 gap-y-1.5">
            {anime.studios.map((s) => {
              const logo = anime.studioLogos?.[s];
              return (
                <Link
                  key={s}
                  to={`/browse?studio=${encodeURIComponent(s)}`}
                  className="inline-flex items-center gap-1.5 hover:text-primary"
                >
                  {logo && (
                    <img
                      src={logo}
                      alt=""
                      loading="lazy"
                      className="h-5 w-5 shrink-0 rounded-sm object-contain"
                    />
                  )}
                  {s}
                </Link>
              );
            })}
          </span>
        ) : null,
      ],
      [t("detail.facts.members"), labels.plain(anime.members)],
      [t("detail.facts.favorites"), anime.favorites ? "★" : null],
    ] as Array<[string, React.ReactNode]>
  ).filter(([, value]) => value && value !== "—");

  if (!hasSynopsis && !hasThemes && facts.length === 0) return null;

  const chips = (items: string[]) =>
    items.map((v) => (
      <Badge key={v} variant="outline" className="font-normal">
        {labels.genreLabel(v)}
      </Badge>
    ));

  return (
    <section className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.overview")}
      </h2>

      {hasSynopsis ? (
        <SynopsisBody synopsis={anime.synopsis} background={anime.background} />
      ) : (
        <p className="text-sm text-muted-foreground">{oneLiner}</p>
      )}

      {hasThemes && (
        <div className="flex flex-col gap-2.5">
          {anime.themes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground/70">
                {t("detail.themes")}
              </span>
              <div className="flex flex-wrap gap-1.5">{chips(anime.themes)}</div>
            </div>
          )}
          {anime.demographics.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground/70">
                {t("detail.audience")}
              </span>
              <div className="flex flex-wrap gap-1.5">{chips(anime.demographics)}</div>
            </div>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border/60 pt-3 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const EPISODES_PER_PAGE = 24;

/**
 * A jump-to-any-episode strip, separate from the player's own compact
 * stepper — this is for scanning watch history at a glance (which episodes
 * are done) and jumping further than one step at a time. One row, horizontal
 * scroll instead of wrapping — a 1000+ episode long-runner never turns into
 * a tall wall of buttons. Signed-in only: nothing persists per-episode
 * otherwise, so there'd be no watched state to show.
 */
function EpisodesSection({
  animeId,
  episodesTotal,
  currentEpisode,
  onSelect,
}: {
  animeId: number;
  episodesTotal: number | null;
  currentEpisode: number;
  onSelect: (episode: number) => void;
}) {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data: progress } = useAnimeProgress(animeId, authed);
  const [page, setPage] = useState(() => Math.floor((currentEpisode - 1) / EPISODES_PER_PAGE));

  useEffect(() => {
    setPage(Math.floor((currentEpisode - 1) / EPISODES_PER_PAGE));
  }, [currentEpisode]);

  if (!authed) return null;

  const completed = new Set(
    (progress?.episodes ?? []).filter((e) => e.completed).map((e) => e.episode),
  );
  const knownMax = Math.max(currentEpisode, ...(progress?.episodes.map((e) => e.episode) ?? [0]));
  const total = episodesTotal ?? knownMax + 4;
  if (total <= 1) return null;

  const totalPages = Math.ceil(total / EPISODES_PER_PAGE);
  const start = page * EPISODES_PER_PAGE + 1;
  const end = Math.min(total, start + EPISODES_PER_PAGE - 1);
  const episodes = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <section className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-lg tracking-tight sm:text-xl">
            {t("detail.sections.episodes")}
          </h2>
          <InfoTooltip>{t("detail.episodesHelpBody")}</InfoTooltip>
        </div>
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={page === 0}
              aria-label={t("common.previous")}
              onClick={() => setPage((p) => p - 1)}
              className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeftIcon className="size-3.5" />
            </button>
            <span className="tabular-nums">
              {start}–{end}
            </span>
            <button
              type="button"
              disabled={page === totalPages - 1}
              aria-label={t("common.next")}
              onClick={() => setPage((p) => p + 1)}
              className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {episodes.map((ep) => {
          const done = completed.has(ep);
          const active = ep === currentEpisode;
          return (
            <button
              key={ep}
              type="button"
              onClick={() => onSelect(ep)}
              aria-current={active}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {ep}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const CHARACTERS_COLLAPSED = 6;

function CharactersBlock({ animeId }: { animeId: number }) {
  const t = useT();
  const { data, isPending } = useCharacters(animeId);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Character | null>(null);

  // A character with no photo has nothing worth a slot in the grid, and
  // nothing to open a modal to either — skip them outright rather than
  // showing an empty placeholder.
  const withArt = (data ?? []).filter((c) => c.imageUrl != null);

  if (!isPending && withArt.length === 0) return null;

  // Mains first, then the rest — one dense grid, 3 per row on mobile.
  const ordered = [...withArt].sort(
    (a, b) =>
      Number(b.role.toLowerCase() === "main") -
      Number(a.role.toLowerCase() === "main"),
  );

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matched = searching
    ? ordered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          (c.voiceActor?.name.toLowerCase().includes(q) ?? false),
      )
    : ordered;
  const visible = searching || expanded ? matched : matched.slice(0, CHARACTERS_COLLAPSED);
  const hidden = matched.length - CHARACTERS_COLLAPSED;

  return (
    <section className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">
          {t("detail.sections.mainCharacters")}
          {ordered.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {ordered.length}
            </span>
          )}
        </h2>
        {ordered.length > CHARACTERS_COLLAPSED && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("detail.searchCharacters")}
              className="h-8 w-40 rounded-full border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary/50 sm:w-48"
            />
          </div>
        )}
      </div>

      {isPending ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("detail.noCharactersMatch")}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
            {visible.map((c) => (
              <CharacterCard key={c.id} character={c} compact onSelect={setSelected} />
            ))}
          </div>
          <CharacterModal character={selected} onOpenChange={(open) => !open && setSelected(null)} />
          {!searching && hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-center rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {expanded
                ? t("detail.collapseCharacters")
                : t("detail.showAllCharacters", { count: ordered.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Our own "you might like" — genre-similar titles, gently reordered toward
 * the viewer's own favourite genres when known. Rotates day to day so a
 * repeat visitor sees more than the same fixed shelf. Replaces the old
 * external recommendations feed.
 */
function RelatedSection({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const { data, isPending } = useSimilarAnime(anime.id);

  const items = data?.items ?? [];

  if (!isPending && items.length === 0) return null;

  return (
    <section className="reveal-group flex flex-col gap-4">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.related")}
      </h2>
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
        {isPending
          ? Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
            ))
          : items.map((item, i) => (
              <div
                key={item.id}
                className="reveal"
                style={{ "--i": i % 6 } as CSSProperties}
              >
                <AnimeCard anime={item} />
              </div>
            ))}
      </div>
    </section>
  );
}

/**
 * Shown for an R+ title the server refused to send (AGE_VERIFICATION_REQUIRED)
 * — the API never even includes the real content here, so there's nothing to
 * reveal client-side; the only way past this is confirming a birth date in
 * Settings, which is a real one-time account fact, not a one-click popup.
 * Hentai never reaches this at all — that's a plain 404, handled above.
 */
function AdultContentGate() {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-md bg-rose-600 px-2.5 py-1 text-sm font-bold text-white">
        18+
      </span>
      <h1 className="font-display text-xl">{t("detail.adultGate.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("detail.adultGate.body")}
      </p>
      <div className="mt-2 flex gap-3">
        <Button variant="outline" asChild>
          <Link to="/">{t("detail.adultGate.leave")}</Link>
        </Button>
        <Button asChild>
          <Link to="/profile?tab=settings">{t("detail.adultGate.verify")}</Link>
        </Button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[260px] w-full rounded-2xl sm:h-[300px]" />
      <div className="flex flex-col gap-6 rounded-2xl border border-border/60 p-5">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
