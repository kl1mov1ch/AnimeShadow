import { genreHref } from "@/lib/format";
import { useMarkNotificationsRead, useUnreadNotifications } from "@/lib/notifications";
import type { AnimeDetail, Character } from "@animeshadow/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ImageIcon,
  LayersIcon,
  ListVideoIcon,
  type LucideIcon,
  MessagesSquareIcon,
  MonitorPlayIcon,
  PlayIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TvIcon,
  UsersIcon,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ShareQrButton } from "@/components/anime/share-qr";
import { AnimeRail } from "@/components/anime/anime-rail";
import { CharacterCard } from "@/components/anime/character-card";
import { CharacterModal } from "@/components/anime/character-modal";
import { FranchiseRail } from "@/components/anime/franchise-section";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { CommentsSection } from "@/components/comments/comments-section";
import { InfoSidebar } from "@/components/anime/episodes-panel";
import { TitleTracker } from "@/components/library/title-tracker";
import { hasWatchTime, WatchTimeCard } from "@/components/anime/title-facts";
import { NextEpisodeBadge } from "@/components/anime/next-episode-badge";
// Overall score is hidden for now (not deleted) — uncomment to bring it back.
// import { ScoreBadge } from "@/components/anime/score-badge";
import { TrailerButton } from "@/components/anime/trailer-button";
import { WatchSection } from "@/components/anime/watch-section";
import { GuestPlayerBanner } from "@/components/auth/guest-player-banner";
import { PulseRings } from "@/components/common/pulse-rings";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareButtons } from "@/components/seo/share-buttons";
import { useT } from "@/i18n";
import { ApiRequestError, apiRequest, setGuestDob } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSlowConnection } from "@/lib/connection";
import { glideTo } from "@/lib/glide";
import { fullSizeCover, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  queryKeys,
  useAnime,
  useAnimeStats,
  useLibrary,
  useCharacters,
  useFranchise,
  useSimilarAnime,
  useUpdateProfile,
} from "@/lib/query";
import { animeUrl, useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";
import { WhenNear } from "@/components/common/when-near";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  // A moment's link (?ep=3&t=754): that episode, from that second.
  const [query] = useSearchParams();
  const startAt = useMemo(() => {
    const ep = Number(query.get("ep"));
    const at = Number(query.get("t"));
    return Number.isInteger(ep) && ep > 0 ? { episode: ep, seconds: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0 } : null;
  }, [query]);
  // Opening a title reads its "new episode" lines.
  const markRead = useMarkNotificationsRead();
  const { data: unreadCount = 0 } = useUnreadNotifications();
  useEffect(() => {
    if (data?.id && unreadCount > 0) markRead.mutate({ animeId: data.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, unreadCount > 0]);

  // The cast sits below the fold, but its first row should be there the
  // moment it is scrolled to: the list and its first twelve faces are
  // fetched while the browser is idle, right after the page itself.
  const client = useQueryClient();
  useEffect(() => {
    if (!data?.id) return;
    const id = data.id;
    const run = () => {
      void client
        .fetchQuery({
          queryKey: queryKeys.characters(id),
          queryFn: ({ signal }) => apiRequest<{ items: Character[] }>(`/anime/${id}/characters`, { signal }).then((r) => r.items),
          staleTime: 30 * 60_000,
        })
        .then((items) => {
          for (const c of items.slice(0, 12)) {
            if (!c.imageUrl) continue;
            const img = new Image();
            img.decoding = "async";
            img.src = imageSrc(c.imageUrl)!;
          }
        })
        .catch(() => undefined);
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(run, { timeout: 2500 }) : window.setTimeout(run, 1200);
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle && cancel) cancel(handle);
      else window.clearTimeout(handle);
    };
  }, [data?.id, client]);
  useEffect(() => {
    setEpisode(startAt?.episode ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Dropping the empties here rather than in the markup keeps the
  // separators honest: a dot only ever appears between two things that
  // actually exist.
  // Each fact carries an icon, and the icon says what the fact *is* on
  // hover — "2023" alone could be a start year or an end year, "PG-13"
  // means nothing to half the audience. With icons doing the separating,
  // the dots between items went: they were only ever there to separate.
  const heroMeta = (
    [
      data.year != null
        ? { icon: CalendarIcon, value: String(data.year), hint: t("detail.facts.aired") }
        : null,
      { icon: TvIcon, value: labels.typeLabel(data.type), hint: t("detail.facts.format") },
      data.episodes
        ? {
            icon: ListVideoIcon,
            value: labels.episodeLabel(data.episodes, data.type),
            hint: t("detail.facts.episodes"),
          }
        : null,
      data.duration
        ? { icon: ClockIcon, value: data.duration, hint: t("detail.facts.duration") }
        : null,
      data.rating
        ? { icon: ShieldIcon, value: data.rating, hint: t("detail.facts.rating") }
        : null,
    ] as Array<{ icon: LucideIcon; value: string; hint: string } | null>
  ).filter((item): item is { icon: LucideIcon; value: string; hint: string } => item != null);
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
    // The site's own colour, not the cover's. Taking each title's dominant
    // colour made every anime page a different palette — pale cream on one,
    // teal on the next — and none of them looked like the rest of the site.
    <article className="relative isolate flex flex-col gap-6 [&>.full-bleed:first-child]:-mt-6 sm:[&>.full-bleed:first-child]:-mt-10">
      <TitleHeader
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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* The poster leads, at a size worth looking at. Everything else
              is a column beside it that wraps under on a phone. */}
          <div className="group mx-auto w-36 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-black/40 ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:ring-[var(--accent-line)] sm:mx-0 sm:w-44 lg:w-48">
            <PosterImage src={poster} title={title} seed={data.id} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="line-clamp-3 font-display text-2xl leading-tight text-foreground sm:text-3xl lg:text-4xl">
                {title}
              </h1>
              {(japaneseTitle || originalTitle) && (
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {[japaneseTitle, originalTitle].filter(Boolean).join(" ")}
                </p>
              )}
            </div>

            {/* Year · type · episodes · runtime, exactly as the catalogue
                knows them — every one of these is a real field, and any the
                title has no answer for simply drops out of the line. */}
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground">
              {heroMeta.map(({ icon: Icon, value, hint }) => (
                <Tooltip key={hint}>
                  <TooltipTrigger asChild>
                    <span className="flex cursor-default items-center gap-1.5 transition-colors hover:text-foreground">
                      <Icon className="size-3.5 text-[var(--accent-ink)]" />
                      {value}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{hint}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {data.genresDetailed.length > 0 && (
              <div className="flex max-h-[3.75rem] flex-wrap gap-1.5 overflow-hidden">
                {data.genresDetailed.slice(0, 8).map((genre) => (
                  <Link key={genre.id} to={genreHref(genre.name)} viewTransition>
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

            {data.synopsis && (
              <p className="line-clamp-4 max-w-3xl text-sm leading-relaxed text-foreground/80">
                {data.synopsis}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {data.score != null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex cursor-default items-center gap-1.5 text-sm">
                      <StarIcon className="size-4 fill-amber-400 text-amber-400" />
                      <span className="font-semibold tabular-nums">{data.score.toFixed(1)}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {data.scoredBy != null && data.scoredBy > 0
                      ? t("detail.scoreHint", { votes: labels.plain(data.scoredBy) })
                      : t("detail.scoreHintBare")}
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    data.airing === "AIRING" ? "bg-emerald-500" : "bg-muted-foreground/60",
                  )}
                />
                {labels.airingLabel(data.airing)}
              </span>
              {data.nextEpisode && (
                <NextEpisodeBadge
                  episode={data.nextEpisode.episode}
                  airingAt={data.nextEpisode.airingAt}
                />
              )}
              <ShareButtons path={animeUrl(data)} compact />
            </div>

            {/* The actions. "Watch" jumps to the player rather than opening
                a second one; the list control itself stays where it always
                was, on the bar above the player, so there is exactly one of
                it on the page. */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild size="lg">
                <a
                  href="#watch"
                  onClick={(event) => {
                    // Down to the player smoothly, not a jump cut. On a
                    // phone the header steps aside on the way down, so
                    // the player can sit right at the top.
                    const target = document.getElementById("watch");
                    if (!target) return;
                    event.preventDefault();
                    glideTo(target, window.matchMedia("(min-width: 768px)").matches ? 80 : 8);
                    window.history.replaceState(window.history.state, "", "#watch");
                  }}
                >
                  <PlayIcon className="fill-current" />
                  {t("detail.sections.watch")}
                </a>
              </Button>
              {data.trailerEmbedUrl && <TrailerButton url={data.trailerEmbedUrl} title={title} />}
              <ShareQrButton anime={data} prominent />
            </div>
          </div>
        </div>
      </TitleHeader>

      {/* Flat sections, not one slab with everything nested inside it.
          Each of these is a thing someone came for, so each gets its own
          card and its own heading rather than being a row inside the
          player's container. */}
      {/* On a phone the section runs edge to edge and the player with it;
          the list and score bar go under the picture, which comes first. */}
      {/* Over the player, never in it: a guest's reminder of what they lose. */}
      <GuestPlayerBanner />
      <Panel
        id="watch"
        icon={MonitorPlayIcon}
        title={t("detail.sections.watch")}
        className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0"
      >
        <WatchSection
          anime={data}
          title={title}
          active
          episode={episode}
          onEpisodeChange={setEpisode}
          startAt={startAt}
        />
      </Panel>

      {/* Under the player: on the left what the title is (the description)
          and what viewers did with it (their marks, beside it on a wide
          screen); on the right, one column of the viewer's own things — the
          list and score, how long it takes, and the facts. On a phone it is
          all one column: the list first, then the rest. */}
      {/* Every card stretches to its neighbours, so the block is one solid
          rectangle with no holes: the columns end on the same line. */}
      <DetailsGrid anime={data} title={title} oneLiner={oneLiner} />

      {/* Everything below the player loads when it's about to be seen —
          its requests included — not all at once when the page opens. */}
      <WhenNear>
        <CharactersPanelM animeId={data.id} />
      </WhenNear>

      <WhenNear minHeight={200}>
        <FranchisePanelM anime={data} />
      </WhenNear>

      <WhenNear>
        <RelatedSectionM anime={data} />
      </WhenNear>

      <WhenNear minHeight={400}>
        <Panel icon={MessagesSquareIcon} title={t("comments.heading")}>
          <CommentsSectionM animeId={data.id} />
        </Panel>
      </WhenNear>
    </article>
  );
}

/* ---------------- pieces ---------------- */

/**
 * The title header, built the same way the homepage hero is: full-bleed key
 * art behind it, fading into the page's own background rather than into a
 * card colour, Same gradients, same full-bleed edge-to-edge treatment, same
 * idea — this page and the homepage are one visual language, not two.
 *
 * When a title has no widescreen art of its own, the site mark and a slow
 * pulse stand in for it — never a stretched poster, which is a different
 * picture, not a smaller version of the same one.
 */
function TitleHeader({
  banner,
  children,
}: {
  /** AniList's own widescreen key visual, when the title has one. */
  banner: string | null;
  children: React.ReactNode;
}) {

  return (
    <div className="full-bleed relative isolate overflow-hidden border-b border-border/60 bg-card">
      <div aria-hidden className="absolute inset-0 -z-10">
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
              <SlicedGlyph />
            </span>
            <PulseRings className="absolute -left-24 -bottom-24 size-[26rem] text-[var(--accent-line)]" />
          </>
        )}


        {/* The same fade the homepage hero uses — the page's own background
            colour, not the card's, so the header dissolves into the page
            around it instead of sitting on top of it as a separate slab. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 sm:via-background/45" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background via-background/75 to-transparent sm:block" />
        <div
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, var(--accent), transparent 70%)",
          }}
        />
      </div>

      {/* Contained to the same width as everything below it, even though
          the art behind it runs edge to edge — the text column lines up
          with the page, only the picture is wider than it. */}
      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        {children}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  id,
  className,
  children,
}: {
  title: string;
  /** What the section is, at a glance — every panel on the page has one. */
  icon: LucideIcon;
  /** Anchor target, so the hero's "watch" button can jump here. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative flex scroll-mt-20 flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5",
        // Off-screen panels aren't laid out or painted until scrolled near.
        // Not the player's: skipping it would throttle the embed mid-episode.
        id !== "watch" && "cv-auto",
        className,
      )}
    >
      {/* The same hairline the header wears, in the same colour — it is
          what ties every surface on the page together as one show. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--accent-line-soft), transparent)",
        }}
      />
      <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--accent-line-soft)] bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]"
        >
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The rest of the franchise, when there is one — its own section now
 *  rather than a card wedged into the synopsis rail. */
function FranchisePanel({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const { data: franchise } = useFranchise(anime.id);
  if (!(franchise ?? []).some((entry) => !entry.current)) return null;
  return (
    <Panel icon={LayersIcon} title={t("detail.sections.seasons")}>
      <FranchiseRail animeId={anime.id} />
    </Panel>
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
 * How the wider audience is tracking this title — counts from
 * Shikimori's lists, not our own visitors. It fills the space under a short synopsis
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

/**
 * What viewers did with the title, as its own panel beside the description:
 * one bar split by list, and the lists themselves. Pointing at or tapping a
 * list lights it in the bar and shows its share big; the viewer's own list,
 * if the title is in it, is marked "вы".
 */
/**
 * Under the player: what the title is, its facts, what viewers did with it,
 * and the viewer's own list and watch time — laid out by what there is.
 * No viewers' marks yet: description and facts share the width. No running
 * time: the list card takes the whole column. Never an empty cell.
 */
function DetailsGrid({ anime, title, oneLiner }: { anime: AnimeDetail; title: string; oneLiner: string }) {
  const { data: stats } = useAnimeStats(anime.id);
  const audience = stats != null && AUDIENCE_KEYS.some(({ key }) => stats[key] != null);
  const frames = useAnimeFrames(anime.id);
  const hasFrames = (frames.data?.length ?? 0) > 0;
  const watchTime = hasWatchTime(anime);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      {/* Two columns on a wide screen: the description beside the frames,
          the facts beside the viewers' marks. Whatever is missing, its
          neighbour takes the whole row — no empty cells. */}
      <div className="order-2 grid min-w-0 gap-4 lg:order-1 xl:grid-cols-2">
        <div className={cn("min-w-0 [&>*]:h-full", !hasFrames && "xl:col-span-2")}>
          <AboutBlockM anime={anime} oneLiner={oneLiner} />
        </div>
        {hasFrames && (
          <div className="min-w-0 [&>*]:h-full">
            <FramesPanel frames={frames.data!} title={title} />
          </div>
        )}
        <div className={cn("min-w-0 [&>*]:h-full", !audience && "xl:col-span-2")}>
          <InfoSidebarM anime={anime} className="justify-between" />
        </div>
        {audience && (
          <div className="min-w-0 [&>*]:h-full">
            <AudiencePanel animeId={anime.id} />
          </div>
        )}
      </div>
      {/* Without the watch-time card the list card alone can't fill a tall
          column, so between lg and xl it rides along as you scroll instead. */}
      <aside
        className={cn(
          "order-1 flex min-w-0 flex-col gap-4 lg:order-2",
          !watchTime && "lg:sticky lg:top-20 lg:self-start xl:static xl:self-stretch",
        )}
      >
        <TitleTracker anime={anime} title={title} className={watchTime ? undefined : "xl:flex-1"} />
        {watchTime && <WatchTimeCard anime={anime} className="flex-1" />}
      </aside>
    </div>
  );
}

/** A frame with the site's mark burned in (made once on the server, see lib/watermark). */
function framed(src: string, width?: number): string {
  const url = imageSrc(src) ?? src;
  return url.includes("/api/img?") ? `${url}&wm=1${width ? `&w=${width}` : ""}` : url;
}

/** The title's screenshots (the catalogue's, cached on the server for an hour). */
function useAnimeFrames(animeId: number) {
  return useQuery({
    queryKey: ["hero-frames", animeId],
    staleTime: Infinity,
    queryFn: ({ signal }) => apiRequest<{ frames: string[] }>(`/anime/${animeId}/frames?v=2`, { signal }).then((r) => r.frames),
  });
}

/**
 * Frames from the anime, beside the description: six small stills, lazy
 * loaded; a click opens one large, arrows step through them.
 */
function FramesPanel({ frames, title }: { frames: string[]; title: string }) {
  const shown = frames.slice(0, 6);
  const [open, setOpen] = useState<number | null>(null);
  const step = (d: number) => setOpen((i) => (i == null ? i : (i + d + shown.length) % shown.length));
  return (
    <Panel icon={ImageIcon} title="Кадры">
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            className="aspect-video overflow-hidden rounded-lg border border-[var(--accent-line-soft)] bg-muted transition-colors hover:border-primary/60"
          >
            <img src={framed(src, 360)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          </button>
        ))}
      </div>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">Кадр из «{title}»</DialogTitle>
          {open != null && (
            <div className="relative bg-black">
              <img src={framed(shown[open]!)} alt="" className="max-h-[80dvh] w-full object-contain" />
              {shown.length > 1 && (
                <>
                  <button type="button" aria-label="Предыдущий" onClick={() => step(-1)} className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-primary">
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button type="button" aria-label="Следующий" onClick={() => step(1)} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-primary">
                    <ChevronRightIcon className="size-5" />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs tabular-nums text-white">
                    {open + 1} / {shown.length}
                  </span>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function AudiencePanel({ animeId }: { animeId: number }) {
  const t = useT();
  const labels = useLabels();
  const { data } = useAnimeStats(animeId);
  const { status } = useAuth();
  const { data: library } = useLibrary(undefined, status === "authenticated");
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  if (!data) return null;
  const rows = AUDIENCE_KEYS.flatMap(({ key, strength }) => {
    const value = data[key];
    return value == null ? [] : [{ key: key as string, strength: strength as number, value }];
  });
  if (rows.length === 0) return null;
  const sum = rows.reduce((n, row) => n + row.value, 0) || 1;
  // The same colours as the lists in "My list": finished in the site's
  // colour, watching green, planned blue, on hold amber, dropped grey.
  const LIST_COLOR: Record<string, string> = {
    completed: "var(--primary)",
    watching: "#34d399",
    planToWatch: "#38bdf8",
    onHold: "#fbbf24",
    dropped: "#a1a1aa",
  };
  const tint = (key: string) => LIST_COLOR[key] ?? "var(--primary)";
  const mine = library?.find((e) => e.anime.id === animeId)?.status;
  const MINE: Record<string, string> = { completed: "COMPLETED", watching: "WATCHING", planToWatch: "PLANNED", onHold: "ON_HOLD", dropped: "DROPPED" };
  const focus = hovered ?? picked;
  const focused = rows.find((r) => r.key === focus);
  const label = (key: string) => t(`detail.audienceStats.${key}` as "detail.audienceStats.watching");

  return (
    <Panel icon={UsersIcon} title="Зрители">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none tabular-nums">
            {focused ? `${Math.round((focused.value / sum) * 100)}%` : labels.compact(data.total ?? sum)}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {focused ? `${label(focused.key)} · ${labels.compact(focused.value)}` : "в списках у зрителей"}
          </p>
        </div>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            aria-label={label(row.key)}
            onClick={() => setPicked((p) => (p === row.key ? null : row.key))}
            onMouseEnter={() => setHovered(row.key)}
            onMouseLeave={() => setHovered(null)}
            className="h-full transition-opacity duration-200"
            style={{ width: `${(row.value / sum) * 100}%`, background: tint(row.key), opacity: focus && focus !== row.key ? 0.25 : 1 }}
          />
        ))}
      </div>
      <ul className="flex flex-1 flex-col justify-evenly gap-0.5">
        {rows.map((row) => {
          const on = focus === row.key;
          const isMine = mine != null && MINE[row.key] === mine;
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => setPicked((p) => (p === row.key ? null : row.key))}
                onMouseEnter={() => setHovered(row.key)}
                onMouseLeave={() => setHovered(null)}
                aria-pressed={picked === row.key}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-[background-color,opacity]",
                  on ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]",
                  focus && !on && "opacity-55",
                )}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: tint(row.key) }} />
                <span className="min-w-0 flex-1 truncate text-foreground/85">{label(row.key)}</span>
                {isMine && <span className="rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">вы</span>}
                <span className="tabular-nums text-muted-foreground">{Math.round((row.value / sum) * 100)}%</span>
                <span className="w-12 text-right font-semibold tabular-nums">{labels.compact(row.value)}</span>
              </button>
              <span aria-hidden className="mx-2 mt-1 block h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, (row.value / Math.max(...rows.map((r) => r.value))) * 100)}%`, background: tint(row.key) }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
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
function AboutBlock({ anime, oneLiner }: { anime: AnimeDetail; oneLiner: string }) {
  const t = useT();
  const labels = useLabels();
  const hasSynopsis = Boolean(anime.synopsis || anime.background);
  const hasThemes = anime.themes.length > 0 || anime.demographics.length > 0;

  const chips = (items: string[]) =>
    items.map((v) => (
      <Badge key={v} variant="outline" className="font-normal">
        {labels.genreLabel(v)}
      </Badge>
    ));

  return (
    <Panel icon={BookOpenIcon} title={t("detail.sections.synopsis")}>
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

    </Panel>
  );
}

// A multiple of both the phone (6) and desktop (12) column counts, so the
// collapsed view is always whole rows — two tidy rows of 6 up through
// tablet, one single row of 12 on desktop, never a half-filled row
// stretched wide by too few items.
const CHARACTERS_COLLAPSED = 10;
const CHARACTERS_GRID = "grid grid-cols-5 gap-x-2.5 gap-y-4 sm:gap-x-3 lg:grid-cols-10";

/**
 * The heading belongs to the content, not to the slot.
 *
 * `CharactersBlock` already bows out when a title has no usable character
 * art — but it was doing that *inside* a `Panel`, which left the bordered
 * surface and its "Персонажи" heading sitting on the page with nothing
 * under them. Deciding one level up means the whole section leaves
 * together. The extra `useCharacters` costs nothing: react-query serves
 * both callers from the same cache entry.
 */
function CharactersPanel({ animeId }: { animeId: number }) {
  const t = useT();
  const { data, isPending } = useCharacters(animeId);
  const hasArt = (data ?? []).some((c) => c.imageUrl != null);
  if (!isPending && !hasArt) return null;
  return (
    <Panel icon={UsersIcon} title={t("detail.sections.characters")}>
      <CharactersBlock animeId={animeId} />
    </Panel>
  );
}

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
              className="self-center rounded-lg border border-border/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent-ink)]"
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
/**
 * "You might like" used to be a static wall — two full rows of up to twelve
 * posters, every one of them the same size the grid gave it, all present
 * at once whether or not any single one earned that much space. It's the
 * same horizontally-scrolling rail every other shelf on the site already
 * uses now: one row, arrows if there's more than fits, a link to the
 * catalogue for the rest — smaller by construction, and a card here looks
 * exactly like a card anywhere else the site shows one.
 */
function RelatedSection({ anime }: { anime: AnimeDetail }) {
  const t = useT();
  const { data, isPending } = useSimilarAnime(anime.id);
  const items = data?.items ?? [];
  if (!isPending && items.length === 0) return null;

  // The one section that used to sit bare on the page background while
  // every other one had a card — it read as having fallen out of the
  // layout. Same surface, same edge, same padding as the rest now.
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5">
      <AnimeRail
        title={t("detail.related")}
        icon={SparklesIcon}
        items={items}
        loading={isPending}
        href={`/browse?genres=${anime.genresDetailed[0]?.id ?? ""}`}
      />
    </div>
  );
}

/**
 * Shown for an R+ title the server refused to send (AGE_VERIFICATION_REQUIRED)
 * — the API never includes the real content here, so there is nothing to
 * reveal client-side. The way past it is right here: a signed-in viewer
 * enters their birth date once (a real, one-time account fact, kept
 * private) and the title opens; a visitor is sent to sign in and brought
 * back. It used to send everyone off to dig through profile settings.
 * Hentai never reaches this at all — that's a plain 404, handled above.
 */
function AdultContentGate() {
  const t = useT();
  const { status } = useAuth();
  const update = useUpdateProfile();
  const client = useQueryClient();
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const maxDate = new Date().toISOString().slice(0, 10);

  const confirm = () => {
    setError(null);
    update.mutate(
      { birthDate },
      {
        onSuccess: (profile) => {
          if (!profile.isAdult) {
            setError(t("detail.adultGate.under18"));
            return;
          }
          // Lists and the title itself now include R+ — everything refetches.
          void client.invalidateQueries();
        },
        onError: (e) => setError(e instanceof Error ? e.message : t("errors.genericTitle")),
      },
    );
  };

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-md bg-rose-600 px-2.5 py-1 text-sm font-bold text-white">18+</span>
      <h1 className="font-display text-xl">{t("detail.adultGate.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {status === "authenticated" ? t("detail.adultGate.body") : "Этот тайтл с рейтингом 18+. Укажите дату рождения — и он откроется."}
      </p>
      {status !== "authenticated" ? (
        <GuestAgeForm />
      ) : (
        <form
          className="flex w-full flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (birthDate) confirm();
          }}
        >
          <label className="flex flex-col gap-1.5 text-left text-xs text-muted-foreground">
            {t("detail.adultGate.birthLabel")}
            <input
              type="date"
              value={birthDate}
              max={maxDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className="h-11 rounded-lg border border-border/70 bg-card/60 px-3 text-sm text-foreground outline-none focus:border-foreground/30"
            />
          </label>
          {error && <p className="text-left text-xs text-rose-400">{error}</p>}
          <Button type="submit" className="h-11" disabled={!birthDate || update.isPending}>
            {t("detail.adultGate.confirm")}
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground/80">{t("detail.adultGate.note")}</p>
        </form>
      )}
      <Link to="/" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t("detail.adultGate.leave")}
      </Link>
    </div>
  );
}

/**
 * A guest's way past the 18+ gate: day, month and year typed in plain
 * fields — no calendar to fight with. Kept in this browser only and sent
 * with each request; the server decides, as it does for an account.
 */
function GuestAgeForm() {
  const client = useQueryClient();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (!d || !m || year.length !== 4 || date.getUTCDate() !== d || date.getUTCMonth() !== m - 1 || y < 1900 || date > new Date()) {
      setError("Проверьте дату — день, месяц и год (четыре цифры).");
      return;
    }
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
    if (age < 18) {
      setError("Этот тайтл доступен только с 18 лет.");
      return;
    }
    setGuestDob(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    // Lists and the title itself now include R+ — everything refetches.
    void client.invalidateQueries();
  };

  const field =
    "h-12 w-full min-w-0 rounded-xl border border-border/70 bg-card/60 text-center font-mono text-lg tabular-nums text-foreground outline-none focus:border-primary/60";
  const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="text-left text-xs text-muted-foreground">Ваша дата рождения</span>
      <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
        <input
          inputMode="numeric"
          autoComplete="bday-day"
          placeholder="ДД"
          aria-label="День"
          value={day}
          onChange={(e) => {
            const v = digits(e.target.value, 2);
            setDay(v);
            if (v.length === 2) monthRef.current?.focus();
          }}
          className={field}
        />
        <input
          ref={monthRef}
          inputMode="numeric"
          autoComplete="bday-month"
          placeholder="ММ"
          aria-label="Месяц"
          value={month}
          onChange={(e) => {
            const v = digits(e.target.value, 2);
            setMonth(v);
            if (v.length === 2) yearRef.current?.focus();
          }}
          className={field}
        />
        <input
          ref={yearRef}
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder="ГГГГ"
          aria-label="Год"
          value={year}
          onChange={(e) => setYear(digits(e.target.value, 4))}
          className={field}
        />
      </div>
      {error && <p className="text-left text-xs text-rose-400">{error}</p>}
      <Button type="submit" className="h-11" disabled={!day || !month || year.length !== 4}>
        Мне есть 18 — открыть
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        Дата хранится только в вашем браузере. С аккаунтом её не придётся вводить снова на другом устройстве.
      </p>
    </form>
  );
}

/** The same full-bleed shape the homepage hero's own skeleton uses, so the
 *  page doesn't jump from one silhouette to a completely different one the
 *  moment the title's data actually arrives. */
function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 [&>.full-bleed:first-child]:-mt-6 sm:[&>.full-bleed:first-child]:-mt-10">
      <div className="full-bleed border-b border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5">
            <Skeleton className="mx-auto size-32 shrink-0 rounded-2xl sm:mx-0 sm:size-40 lg:size-48" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6 rounded-2xl border border-border/60 p-5">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

/*
 * The page keeps the current episode in its own state, so picking an
 * episode re-rendered everything on it — characters, franchise, similar
 * titles, comments — none of which depends on the episode. On a long show
 * that turned every switch into a full-page re-render and relayout. These
 * only take the title, which doesn't change when the episode does.
 */
const AboutBlockM = memo(AboutBlock);
const InfoSidebarM = memo(InfoSidebar);
const CharactersPanelM = memo(CharactersPanel);
const FranchisePanelM = memo(FranchisePanel);
const RelatedSectionM = memo(RelatedSection);
const CommentsSectionM = memo(CommentsSection);
