import type { AnimeDetail, Character } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimeCard } from "@/components/anime/anime-card";
import { CharacterCard } from "@/components/anime/character-card";
import { CharacterModal } from "@/components/anime/character-modal";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { CommentsSection } from "@/components/comments/comments-section";
import { LibraryControls } from "@/components/anime/library-controls";
import { ReviewsSection } from "@/components/anime/reviews-section";
import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { WatchSection } from "@/components/anime/watch-section";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButtons } from "@/components/seo/share-buttons";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useAnime, useCharacters, useSimilarAnime } from "@/lib/query";
import { isAdultRating, useAdultConfirmed } from "@/hooks/use-adult-content";
import { paletteFromSeed, useImagePalette } from "@/hooks/use-image-palette";
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
  const [adultConfirmed, confirmAdult] = useAdultConfirmed();

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
    return (
      <ErrorState
        title={notFound ? t("detail.notFound") : t("detail.loadError")}
        message={notFound ? t("detail.notFoundBody") : t("detail.loadErrorBody")}
        onRetry={notFound ? undefined : () => void refetch()}
      />
    );
  }

  if (isAdultRating(data.rating) && !adultConfirmed) {
    return <AdultContentGate title={data.titleLocalized ?? data.title} onConfirm={confirmAdult} />;
  }

  const title = labels.title(data);
  const backdrop = imageSrc(data.imageLargeUrl ?? data.imageUrl);
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
    <article className="relative flex flex-col gap-6">
      <AmbientBackdrop src={backdrop} genres={data.genres} seed={data.id} />

      {/* Banner — sits directly on the ambient wash, no frame */}
      <header className="flex flex-col gap-3">
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
          {data.rank != null && data.rank > 0 && (
            <>
              <Dot />
              <span className="tabular-nums">{t("detail.ranked", { rank: data.rank })}</span>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl leading-tight sm:text-4xl">{title}</h1>
          {secondaryTitle && (
            <p className="text-sm text-muted-foreground">{secondaryTitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <ScoreBadge score={data.score} size="md" />
          {data.scoredBy != null && (
            <span>{t("common.ratings", { count: labels.compact(data.scoredBy) })}</span>
          )}
          {data.translated && (
            <Badge variant="outline" className="text-[11px]">
              {t("detail.machineTranslated")}
            </Badge>
          )}
        </div>

        {data.genresDetailed.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
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

        <ShareButtons path={animeUrl(data)} title={title} className="pt-1" />
      </header>

      {/* One continuous surface: left rail + stacked sections, hairline-separated */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="grid lg:grid-cols-[288px_minmax(0,1fr)] lg:divide-x lg:divide-border/60">
          <aside className="flex flex-col gap-4 border-b border-border/60 p-5 lg:border-b-0">
            <div className="mx-auto w-40 overflow-hidden rounded-xl border border-border/60 bg-muted sm:w-48 lg:mx-0 lg:w-full">
              <PosterImage src={poster} title={title} seed={data.id} />
            </div>
            <LibraryControls animeId={data.id} title={title} />
            <TrailerButton url={data.trailerEmbedUrl} title={title} />
            <StatsList anime={data} />
          </aside>

          <div className="flex min-w-0 flex-col divide-y divide-border/60">
            <Block title={t("detail.sections.watch")}>
              <WatchSection anime={data} title={title} active />
            </Block>

            {(data.synopsis || data.background) && (
              <Block title={t("detail.overview")}>
                <SynopsisBody synopsis={data.synopsis} background={data.background} />
              </Block>
            )}

            <AboutBlock anime={data} oneLiner={oneLiner} />

            <CharactersBlock animeId={data.id} />

            <Block title={t("detail.sections.reviews")}>
              <ReviewsSection animeId={data.id} active />
            </Block>

            <div className="p-5">
              <CommentsSection animeId={data.id} />
            </div>
          </div>
        </div>
      </div>

      <RelatedSection anime={data} />
    </article>
  );
}

/* ---------------- pieces ---------------- */

/**
 * Maps a title's genres onto one of a few ambient "moods", which CSS turns into
 * a different backdrop character per anime — tighter and faster for action,
 * soft and slow for romance, and so on. Purely cosmetic; falls back to calm.
 */
function ambientMood(genres: string[]): string {
  const joined = genres.join(" ").toLowerCase();
  if (/ужас|триллер|психолог|horror|thriller|psycholog|seinen|детектив/.test(joined))
    return "dark";
  if (/экшен|сражения|боевы|сёнен|спорт|action|shounen|sports|martial/.test(joined))
    return "action";
  if (/романтика|повседнев|сёдзё|romance|slice|shoujo|музыка|music/.test(joined))
    return "romance";
  if (/фэнтези|магия|приключения|изекай|fantasy|magic|adventure|isekai|mytholog/.test(joined))
    return "fantasy";
  if (/фантастика|меха|космос|sci-?fi|mecha|space|киберпанк|cyber/.test(joined))
    return "tech";
  return "calm";
}

function AmbientBackdrop({
  src,
  genres,
  seed,
}: {
  src: string | undefined;
  genres: string[];
  seed: number;
}) {
  const palette = useImagePalette(src);
  const mood = ambientMood(genres);
  // No artwork at all — never leave the page flat; use a seeded stand-in
  // wash instead (same treatment PosterFallback gives the poster box).
  const fallback = src ? null : paletteFromSeed(String(seed));
  const effective = palette ?? fallback;
  const tintVars = effective
    ? ({ "--ambient-rgb": effective.rgb } as CSSProperties)
    : undefined;
  return (
    <>
      <div className="ambient-backdrop" aria-hidden>
        {src ? (
          <div
            className="ambient-backdrop__layer"
            style={{ "--ambient-image": `url("${src}")` } as CSSProperties}
          />
        ) : (
          <div className="ambient-backdrop__layer ambient-backdrop__layer--fallback" style={tintVars} />
        )}
      </div>
      {effective && (
        <>
          <div className="ambient-tint" style={tintVars} data-mood={mood} aria-hidden />
          <span
            className="ambient-orb ambient-orb--a"
            style={tintVars}
            data-mood={mood}
            aria-hidden
          />
          <span
            className="ambient-orb ambient-orb--b"
            style={tintVars}
            data-mood={mood}
            aria-hidden
          />
        </>
      )}
    </>
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

const SYNOPSIS_CLAMP_AT = 520;

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
            !expanded && "line-clamp-[7]",
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

function AboutBlock({ anime, oneLiner }: { anime: AnimeDetail; oneLiner: string }) {
  const t = useT();
  const labels = useLabels();
  const chips = (items: string[]) =>
    items.map((v) => (
      <Badge key={v} variant="outline" className="font-normal">
        {labels.genreLabel(v)}
      </Badge>
    ));

  if (anime.themes.length === 0 && anime.demographics.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.about")}
      </h2>
      <p className="text-sm text-muted-foreground">{oneLiner}</p>
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
    </section>
  );
}

function StatsList({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const labels = useLabels();
  const rows: Array<[string, React.ReactNode]> = [
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
        <span className="flex flex-wrap justify-end gap-x-2">
          {anime.studios.map((s) => (
            <Link
              key={s}
              to={`/browse?q=${encodeURIComponent(s)}`}
              className="hover:text-primary"
            >
              {s}
            </Link>
          ))}
        </span>
      ) : null,
    ],
    [t("detail.facts.members"), labels.plain(anime.members)],
    [t("detail.facts.favorites"), anime.favorites ? "★" : null],
  ];

  return (
    <dl className="flex flex-col divide-y divide-border/50 text-sm">
      {rows
        .filter(([, value]) => value && value !== "—")
        .map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

const CHARACTERS_COLLAPSED = 6;

function CharactersBlock({ animeId }: { animeId: number }) {
  const t = useT();
  const { data, isPending } = useCharacters(animeId);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Character | null>(null);

  if (!isPending && (!data || data.length === 0)) return null;

  // Mains first, then the rest — one dense grid, 3 per row on mobile.
  const ordered = [...(data ?? [])].sort(
    (a, b) =>
      Number(b.role.toLowerCase() === "main") -
      Number(a.role.toLowerCase() === "main"),
  );
  const visible = expanded ? ordered : ordered.slice(0, CHARACTERS_COLLAPSED);
  const hidden = ordered.length - CHARACTERS_COLLAPSED;

  return (
    <section className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.sections.mainCharacters")}
        {data && data.length > 0 && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {data.length}
          </span>
        )}
      </h2>

      {isPending ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
            {visible.map((c) => (
              <CharacterCard key={c.id} character={c} compact onSelect={setSelected} />
            ))}
          </div>
          <CharacterModal character={selected} onOpenChange={(open) => !open && setSelected(null)} />
          {hidden > 0 && (
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
 * Interstitial for "Rx"-rated titles — everything about the page (poster,
 * synopsis, player) stays out of the DOM until the viewer confirms, not just
 * visually hidden behind it. Confirmation is remembered site-wide, so this
 * only shows once.
 */
function AdultContentGate({
  title,
  onConfirm,
}: {
  title: string;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-md bg-rose-600 px-2.5 py-1 text-sm font-bold text-white">
        18+
      </span>
      <h1 className="font-display text-xl">{t("detail.adultGate.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("detail.adultGate.body", { title })}
      </p>
      <div className="mt-2 flex gap-3">
        <Button variant="outline" asChild>
          <Link to="/">{t("detail.adultGate.leave")}</Link>
        </Button>
        <Button onClick={onConfirm}>{t("detail.adultGate.confirm")}</Button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="rounded-2xl border border-border/60">
        <div className="grid lg:grid-cols-[288px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 p-5">
            <Skeleton className="mx-auto aspect-[2/3] w-40 rounded-xl lg:mx-0 lg:w-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="flex flex-col gap-6 p-5">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
