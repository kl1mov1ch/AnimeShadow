import type { AnimeDetail, Character } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { BookOpenIcon, SearchIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AnimeCard } from "@/components/anime/anime-card";
import { CharacterCard } from "@/components/anime/character-card";
import { CharacterModal } from "@/components/anime/character-modal";
import { FranchiseRail } from "@/components/anime/franchise-section";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { CommentsSection } from "@/components/comments/comments-section";
import { TitleTracker } from "@/components/library/title-tracker";
import { NextEpisodeBadge } from "@/components/anime/next-episode-badge";
import { OpeningVideo } from "@/components/anime/opening-video";
// Overall score is hidden for now (not deleted) — uncomment to bring it back.
// import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { WatchSection } from "@/components/anime/watch-section";
import { ThemePlayer } from "@/components/anime/theme-player";
import { PulseRings } from "@/components/common/pulse-rings";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButtons } from "@/components/seo/share-buttons";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useSlowConnection } from "@/lib/connection";
import { fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useAnime,
  useAnimeStats,
  useCharacters,
  useFranchise,
  useSimilarAnime,
} from "@/lib/query";
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
  // Above every early return below — hooks can't be conditional.
  const slow = useSlowConnection();
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
            // Overall score hidden for now:
            // ...(data.score != null && data.scoredBy != null
            //   ? {
            //       aggregateRating: {
            //         "@type": "AggregateRating",
            //         ratingValue: data.score,
            //         ratingCount: data.scoredBy,
            //         bestRating: 10,
            //       },
            //     }
            //   : {}),
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
  const cardCover = data.imageLargeUrl ?? data.imageUrl;
  // One poster, shown large: worth the full-size file on a decent connection,
  // not on a slow one.
  const poster = imageSrc(slow ? cardCover : fullSizeCover(cardCover));
  const originalTitle = data.title && data.title !== title ? data.title : null;
  const japaneseTitle =
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
    // The title's own colour, published once here as a custom property that
    // everything below can reach for. Declared with a fallback at each use
    // site rather than conditionally set, so a title AniList has no colour
    // for simply keeps the site accent and needs no second code path.
    // `isolate` is load-bearing: it gives the article its own stacking
    // context, so the wash below can sit at -z-10 behind the content without
    // falling behind the body's own opaque background, where it would be
    // invisible.
    <article
      className="title-themed relative isolate flex flex-col gap-6"
      style={
        data.accentColor
          ? ({ "--title-accent": data.accentColor } as CSSProperties)
          : undefined
      }
    >
      {/* The page wearing the title's colour. Full-bleed past the layout's
          own gutters (the shell caps content at 1400px), strongest behind the
          header and gone well before the comments — a wash, not a tint over
          everything, so text contrast is never at its mercy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[90vh] w-screen -translate-x-1/2"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40vh] -z-10 h-[70vh] w-screen -translate-x-1/2"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 40%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
        }}
      />
      <TitleHeader
        animeId={data.id}
        // The widescreen banner is decoration behind the header, and one of
        // the largest images on the page. On a slow link the header keeps its
        // tinted surface instead.
        banner={!slow && data.bannerImage ? imageSrc(data.bannerImage) ?? null : null}
      >
        {/* Poster alongside everything else, not stacked in a separate
            sidebar below — the header is the one place all of a title's
            identity (art, name, rating, genres, actions) lives together.
            It sits a little higher than the text column from sm up and
            crosses the panel's top edge, which is what stops it reading as
            a stray thumbnail parked in the bottom-left corner. */}
        <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5">
          <div className="group mx-auto w-32 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-black/40 ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:ring-[var(--accent-line)] sm:mx-0 sm:w-40 lg:w-48">
            <PosterImage src={poster} title={title} seed={data.id} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:h-0 sm:min-h-full sm:overflow-hidden">
            {/* The meta line lives in the text column, beside the poster —
                never above it. As a full-width row at the top of the panel
                it ran straight under the raised poster, which cut the year
                and rating in half. */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={data.airing === "AIRING" ? "text-[var(--accent-ink)]" : undefined}>
                  {labels.airingLabel(data.airing)}
                </span>
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

            <div className="flex flex-col gap-1">
              <h1 className="line-clamp-3 font-display text-2xl leading-tight text-foreground sm:line-clamp-2 sm:text-3xl lg:text-4xl">
                {title}
              </h1>
              {(originalTitle || japaneseTitle) && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {[originalTitle, japaneseTitle].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {data.nextEpisode && (
              <NextEpisodeBadge
                episode={data.nextEpisode.episode}
                airingAt={data.nextEpisode.airingAt}
              />
            )}

            {/* Rating — score, vote count, rank. Hidden for now (not deleted). */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground empty:hidden">
              {/* <ScoreBadge score={data.score} size="md" />
              {data.scoredBy != null && (
                <span>{t("common.ratings", { count: labels.compact(data.scoredBy) })}</span>
              )}
              {data.rank != null && data.rank > 0 && (
                <span className="tabular-nums">{t("detail.ranked", { rank: data.rank })}</span>
              )} */}
              {data.translated && (
                <Badge variant="outline" className="text-[11px]">
                  {t("detail.machineTranslated")}
                </Badge>
              )}
            </div>

            {data.genresDetailed.length > 0 && (
              // At most two rows of genres; the rest are one click away in
              // the catalogue anyway.
              <div className="flex max-h-[3.75rem] flex-wrap gap-1.5 overflow-hidden">
                {data.genresDetailed.slice(0, 10).map((genre) => (
                  <Link key={genre.id} to={`/browse?genres=${genre.id}`}>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer font-normal transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-surface-strong)] hover:text-[var(--accent-ink)]"
                    >
                      {labels.genreLabel(genre.name)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}

            {data.trailerEmbedUrl && (
              <div className="mt-auto flex justify-end pt-1">
                <TrailerButton url={data.trailerEmbedUrl} title={title} />
              </div>
            )}
          </div>
        </div>
      </TitleHeader>

      {/* One continuous surface, hairline-separated sections — no more
          poster sidebar, since the header above already carries it. */}
      <div className="relative flex flex-col divide-y divide-[var(--accent-line-soft)] overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] backdrop-blur-sm">
        {/* Same hairline as the header above, in the same colour — it is what
            ties the two surfaces together as one page belonging to one show. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--accent-line-soft), transparent)",
          }}
        />
        <Block title={t("detail.sections.watch")}>
          {/* Everything you do with a title while watching it — status,
              score, episode, note — in one bar right above the
              player, where watching actually happens. */}
          <div className="rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 p-2 shadow-sm backdrop-blur-sm sm:px-3">
            <TitleTracker anime={data} title={title} />
          </div>
          <WatchSection
            anime={data}
            title={title}
            active
            episode={episode}
            onEpisodeChange={setEpisode}
          />
        </Block>

        <OverviewBlock anime={data} oneLiner={oneLiner} />

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
 * The title header, with no key visual behind it.
 *
 * It used to run the show's own banner across the full width, dimmed under a
 * gradient so the text on top stayed readable. Three things were wrong with
 * that: the composition changed with every title (a wide key visual and a
 * blurred upscaled poster are not the same picture), the contrast of the text
 * panel depended on whichever frame we happened to have, and the poster —
 * the one image genuinely worth looking at — ended up competing with a
 * blurred copy of itself.
 *
 * This is a plain surface in the site's own colours: the poster is the only
 * artwork on it, every title page is laid out identically, and the decoration
 * is monochrome, so it reads the same in either theme.
 */
function TitleHeader({
  animeId,
  banner,
  children,
}: {
  animeId: number;
  /** AniList's own widescreen key visual, when the title has one. */
  banner: string | null;
  children: React.ReactNode;
}) {
  // A short dwell before the opening is even requested. Opening a title and
  // immediately going back must not cost a video fetch, and the header is
  // readable from the first frame either way — the motion is a reward for
  // staying, not part of the page loading.
  const [wantsOpening, setWantsOpening] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWantsOpening(true), 1_500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* The hairline, wearing the title's colour. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--accent-line), transparent)",
        }}
      />

      <div aria-hidden className="pointer-events-none absolute inset-0">
        {banner ? (
          // A real landscape key visual, framed as one — not a portrait
          // poster stretched across a 16:5 box, which is what made the old
          // backdrop read as broken rather than cinematic.
          <img
            src={banner}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-center"
          />
        ) : (
          <>
            <span className="absolute -right-10 -top-16 select-none font-display text-[15rem] leading-none text-foreground/[0.035]">
              影
            </span>
            <PulseRings className="absolute -left-24 -bottom-24 size-[26rem] text-[var(--accent-line)]" />
          </>
        )}

        {/* The show itself, over whatever still is behind it. OpeningVideo
            fades in only once there are real frames and refuses outright on
            a touch device or a metered connection, so this is either an
            upgrade on the banner or nothing at all. */}
        <div className="absolute inset-0">
          <OpeningVideo animeId={animeId} active={wantsOpening} />
        </div>

        {/* Legibility first — every layer above sits under these. */}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/85 to-card/45" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-card via-card/70 to-transparent sm:block" />
        <div
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, var(--accent), transparent 70%)",
          }}
        />
      </div>

      {/* No forced minimum height: the content decides how tall this is, so a
          short title never sits above a band of empty artwork. */}
      <div className="relative flex flex-col gap-3 p-4 sm:p-6 lg:p-8">{children}</div>
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
      <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
        {/* A short bar in the title's own colour. The colour never touches
            the text itself — a pale cover would make the heading unreadable
            — only a mark beside it. */}
        <span
          aria-hidden
          className="h-4 w-1 shrink-0 rounded-full"
          style={{ background: "var(--accent-ink)" }}
        />
        {title}
      </h2>
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
  const long = (synopsis?.length ?? 0) > SYNOPSIS_CLAMP_AT;

  return (
    <div className="flex flex-col gap-4">
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
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-sm font-medium text-[var(--accent-ink)] transition-colors hover:opacity-80"
        >
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
      {/* Real production/background trivia, not a stat — its own quietly
          bordered card instead of a plain paragraph tacked on behind
          "show more". Used to only appear once expanded, which meant most
          visitors never saw it at all and a short-synopsis title read as
          emptier than it actually was. */}
      {background && (
        <div
          className="flex flex-col gap-1.5 rounded-xl border p-3.5"
          // Frame and fill take the title's colour; the label inside keeps
          // the site's, because a pale cover would leave that text unreadable.
          style={{
            borderColor: "var(--accent-line-soft)",
            background: "var(--accent-surface)",
          }}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent-ink)]">
            <BookOpenIcon className="size-3.5" />
            {t("detail.background")}
          </span>
          <p className="text-sm leading-relaxed text-foreground/80">{background}</p>
        </div>
      )}
    </div>
  );
}

/**
 * How the wider audience is tracking this title — counts from MAL via
 * Jikan, not our own visitors. It fills the space under a short synopsis
 * with something factual rather than padding, and it is deliberately
 * quiet: five rows, one hue, no claim about whether any of it is good.
 *
 * Renders nothing at all when the upstream had no numbers (the endpoint
 * answers null rather than failing), so a title without stats simply does
 * not show the block instead of showing an empty one.
 */
/** One hue — the title's own — at five strengths, so the five buckets stay
 *  distinguishable without introducing five unrelated colours to a page that
 *  is already wearing a colour. Ordered the way a list is actually read:
 *  the biggest commitment first. */
const AUDIENCE_KEYS = [
  { key: "completed", strength: 100 },
  { key: "watching", strength: 76 },
  { key: "planToWatch", strength: 54 },
  { key: "onHold", strength: 36 },
  { key: "dropped", strength: 22 },
] as const;

function AudienceStats({ animeId }: { animeId: number }) {
  const t = useT();
  const labels = useLabels();
  const { data } = useAnimeStats(animeId);
  const [hovered, setHovered] = useState<string | null>(null);

  if (!data) return null;

  // flatMap rather than map+filter: dropping the empty buckets this way
  // narrows `value` to a number on its own, with no type predicate to keep
  // in step with the shape it is narrowing.
  const rows = AUDIENCE_KEYS.flatMap(({ key, strength }) => {
    const value = data[key];
    return value == null
      ? []
      : [{ key: key as string, strength: strength as number, value }];
  });

  if (rows.length === 0) return null;

  const sum = rows.reduce((n, row) => n + row.value, 0) || 1;
  // Scaled against the biggest row, not the total — with five buckets, a
  // share-of-total bar leaves every one of them a barely visible sliver.
  const max = Math.max(...rows.map((row) => row.value), 1);
  const tint = (strength: number) =>
    `color-mix(in srgb, var(--accent) ${strength}%, transparent)`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors duration-300 hover:border-[color-mix(in_srgb,var(--title-accent,var(--primary))_35%,transparent)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground/70">
          {t("detail.audienceTitle")}
        </span>
        {data.total != null && (
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {t("detail.audienceTotal", { count: labels.compact(data.total) })}
          </span>
        )}
      </div>

      {/* One bar for the whole audience, split by what they did with the
          title. The per-row bars below answer "how many"; this answers "out
          of everyone, how does this title get treated" — which is the
          question the block is actually here for and which five separate
          bars never quite showed. */}
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {rows.map((row) => (
          <span
            key={row.key}
            className="h-full rounded-full transition-all duration-500 ease-out first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(row.value / sum) * 100}%`,
              background: tint(row.strength),
              opacity: hovered && hovered !== row.key ? 0.25 : 1,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        {rows.map((row, i) => {
          const share = Math.round((row.value / sum) * 100);
          const dimmed = hovered != null && hovered !== row.key;
          return (
            <div
              key={row.key}
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
              className={cn(
                "animate-in fade-in slide-in-from-left-2 flex items-center gap-2.5 rounded-lg px-1.5 py-1 duration-500",
                "transition-[opacity,background-color]",
                dimmed ? "opacity-45" : "opacity-100",
                hovered === row.key && "bg-secondary/50",
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: tint(row.strength) }}
              />
              <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
                {t(
                  `detail.audienceStats.${row.key}` as "detail.audienceStats.watching",
                )}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/70">
                <span
                  className="block h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.round((row.value / max) * 100)}%`,
                    background: tint(row.strength),
                  }}
                />
              </span>
              {/* The share only appears for the row being pointed at — five
                  percentages sitting there permanently is a wall of numbers
                  nobody asked for, but it is the first thing you want the
                  moment you single one out. */}
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/70">
                {hovered === row.key ? `${share}%` : ""}
              </span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-foreground/80">
                {labels.compact(row.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The block used to stack synopsis, themes, facts and seasons as separate
 * full-width rows, each claiming a row of its own regardless of how much it
 * actually had to say — a one-line "6 episodes" fact took the same width as
 * three paragraphs of synopsis. Now it's one deliberate split: the synopsis
 * (almost always the most content, and prose rather than a lookup list) gets
 * the wide column, while facts and seasons — both short, scannable, reference
 * material rather than something you read start to finish — share a single
 * narrow rail beside it. Below the desktop breakpoint there's no room for two
 * columns, so it's plain document order: synopsis first, the rail after.
 *
 * The cast used to be its own full section further down the page, divided
 * off by a hairline like Overview and Comments — its own heading, its own
 * card row, for content that's really just more of "everything about this
 * show". It's folded in here instead, directly under the description
 * (and the facts/seasons rail beside it), so the whole page reads as one
 * "about this title" block followed by "what people are saying" rather
 * than four stacked sections of decreasing relevance.
 */
function OverviewBlock({ anime, oneLiner }: { anime: AnimeDetail; oneLiner: string }) {
  const t = useT();
  const labels = useLabels();
  const hasSynopsis = Boolean(anime.synopsis || anime.background);
  const hasThemes = anime.themes.length > 0 || anime.demographics.length > 0;
  // Fetched here too (not just inside FranchiseRail) purely to decide the
  // layout — react-query dedupes the identical query, so this costs nothing
  // extra. Reserving the desktop two-column split for a title with nothing
  // else in its franchise (or no *other* title, once the one being viewed
  // is excluded — see FranchiseRail) would leave an empty gap on the page.
  const { data: franchise } = useFranchise(anime.id);
  const hasFranchise = (franchise ?? []).some((entry) => !entry.current);
  // Same deduping logic, so the empty-everything guard below doesn't hide
  // a title that has nothing else *but* a cast worth showing.
  const { data: characters } = useCharacters(anime.id);
  const hasCharacters = (characters ?? []).some((c) => c.imageUrl != null);

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
          <span className="flex flex-wrap gap-x-3 gap-y-1.5">
            {anime.studios.map((s) => {
              const logo = anime.studioLogos?.[s];
              return (
                <Link
                  key={s}
                  to={`/browse?studio=${encodeURIComponent(s)}`}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--accent-ink)]"
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
      [t("detail.facts.favorites"), anime.favorites ? labels.plain(anime.favorites) : null],
    ] as Array<[string, React.ReactNode]>
  ).filter(([, value]) => value && value !== "—");

  if (!hasSynopsis && !hasThemes && facts.length === 0 && !hasFranchise && !hasCharacters)
    return null;

  const chips = (items: string[]) =>
    items.map((v) => (
      <Badge key={v} variant="outline" className="font-normal">
        {labels.genreLabel(v)}
      </Badge>
    ));

  const hasRail = facts.length > 0 || hasFranchise;

  return (
    <section className="flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-1.5 font-display text-lg tracking-tight sm:text-xl">
        <span aria-hidden className="text-[var(--accent-ink)]">
          影
        </span>
        {t("detail.overview")}
      </h2>

      <div
        className={cn(
          "flex flex-col gap-5",
          hasRail && "lg:grid lg:grid-cols-[15rem_1fr] lg:items-start lg:gap-6",
        )}
      >
        {/* Synopsis stays first in the DOM — below lg there's no grid at
            all, just normal document flow, so that's what decides the
            stacking order: prose leads, the rail follows. From lg, the grid
            takes over and `order` puts the rail first (leftmost) instead. */}
        <div className="flex min-w-0 flex-col gap-4 lg:order-2">
          {hasSynopsis ? (
            <SynopsisBody synopsis={anime.synopsis} background={anime.background} />
          ) : (
            <p className="text-sm text-muted-foreground">{oneLiner}</p>
          )}

          <AudienceStats animeId={anime.id} />

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

          <ThemePlayer animeId={anime.id} />
        </div>

        {hasRail && (
          <aside
            className={cn(
              "flex flex-col gap-4 lg:order-1",
              hasSynopsis && "border-t border-border/60 pt-4 lg:border-t-0 lg:pt-0",
            )}
          >
            {facts.length > 0 && <FactsPanel facts={facts} />}
            {hasFranchise && <FranchiseRail animeId={anime.id} />}
          </aside>
        )}
      </div>

      <CharactersBlock animeId={anime.id} />
    </section>
  );
}



// Enough to answer "what, when, how long" at a glance — the rest (exact end
// date, season, studios, list/favorite counts) is real but secondary, one
// tap away instead of stretching the rail to fit however many facts a given
// title happens to have.
const FACTS_COLLAPSED = 5;

/** A compact, Telegram-settings-style list rather than a two-column grid —
 * the rail is only 15rem wide, nowhere near enough room for label/value
 * pairs to sit two abreast. Values that are more than a short string (the
 * studio links, each with its own logo) drop the inline label/value row for
 * a stacked one, so they can wrap onto their own lines without fighting a
 * `truncate` that was never going to work on them anyway. */
function FactsPanel({ facts }: { facts: Array<[string, React.ReactNode]> }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? facts : facts.slice(0, FACTS_COLLAPSED);
  const hasMore = facts.length > FACTS_COLLAPSED;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3.5">
      <span className="text-xs font-medium text-muted-foreground/70">
        {t("detail.sections.details")}
      </span>
      <dl className="flex flex-col gap-2 text-sm">
        {visible.map(([label, value]) => {
          const inline = typeof value === "string" || typeof value === "number";
          return (
            <div
              key={label}
              className={inline ? "flex items-baseline justify-between gap-3" : "flex flex-col gap-1"}
            >
              <dt className={cn("text-muted-foreground", inline && "shrink-0")}>{label}</dt>
              <dd className={inline ? "min-w-0 truncate text-right font-medium" : "font-medium"}>
                {value}
              </dd>
            </div>
          );
        })}
      </dl>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-medium text-[var(--accent-ink)] transition-colors hover:opacity-80"
        >
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  );
}

// A multiple of both the phone (6) and desktop (12) column counts, so the
// collapsed view is always whole rows — two tidy rows of 6 up through
// tablet, one single row of 12 on desktop, never a half-filled row
// stretched wide by too few items.
const CHARACTERS_COLLAPSED = 12;
const CHARACTERS_GRID = "grid grid-cols-6 gap-x-2 gap-y-4 lg:grid-cols-12";

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
    // A plain div, not its own section — this used to be a full block
    // further down the page with its own hairline divider; now it's the
    // tail end of Overview, just under the description (and the facts/
    // seasons rail beside it), so a light top border is enough to mark
    // where one ends and the cast begins without a whole new card row.
    <div className="flex flex-col gap-4 border-t border-border/60 pt-4">
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
              className="h-8 w-40 rounded-full border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-48"
            />
          </div>
        )}
      </div>

      {isPending ? (
        <div className={CHARACTERS_GRID}>
          {Array.from({ length: CHARACTERS_COLLAPSED }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="aspect-square w-full rounded-full" />
              <Skeleton className="h-2.5 w-10 rounded-full" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("detail.noCharactersMatch")}</p>
      ) : (
        <>
          {/* Round avatars that stretch to fill the row rather than a fixed
              poster-sized tile — a cast can run into the dozens. Fixed
              column counts (not auto-fit) so a half-full row never gets
              stretched wide by too few items: 6 per row through tablet, a
              full 12-wide single row on desktop. */}
          <div className={CHARACTERS_GRID}>
            {visible.map((c) => (
              <CharacterCard key={c.id} character={c} compact onSelect={setSelected} />
            ))}
          </div>
          <CharacterModal character={selected} onOpenChange={(open) => !open && setSelected(null)} />
          {!searching && hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-center rounded-full border border-border/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent-ink)]"
            >
              {expanded
                ? t("detail.collapseCharacters")
                : t("detail.showAllCharacters", { count: ordered.length })}
            </button>
          )}
        </>
      )}
    </div>
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
