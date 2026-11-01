import { genreHref } from "@/lib/format";
import { useMarkNotificationsRead, useUnreadNotifications } from "@/lib/notifications";
import type { AnimeDetail, Character } from "@animeshadow/shared";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
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
import { AgeConfirm, adultConfirmed } from "@/components/anime/age-confirm";
import { isAdultRating } from "@/hooks/use-adult-content";
import { ApiRequestError, apiRequest } from "@/lib/api";
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
} from "@/lib/query";
import { animeUrl, useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";
import { WhenNear } from "@/components/common/when-near";
import { AnimeOpenings } from "@/components/music/anime-openings";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const [openingsAvailable, setOpeningsAvailable] = useState<{ id: number; available: boolean } | null>(null);
  const hasOpenings = openingsAvailable?.id === data?.id && openingsAvailable?.available;
  const onOpeningsAvailable = useCallback((available: boolean) => setOpeningsAvailable({ id: data?.id ?? 0, available }), [data?.id]);
  // An 18+ title asks "are you 18?" once per browser — above the early returns too.
  const [adultOk, setAdultOk] = useState(adultConfirmed);
  // Above every early return below — hooks can't be conditional.
  const slow = useSlowConnection();
  // The route component isn't remounted when navigating from one anime page
  // to another (same route, different :id) — reset explicitly, or the new
  // title would open on whatever episode number the last one left behind.
  // A moment's link (?ep=3&t=754): that episode, from that second.
  const [query] = useSearchParams();
  // An episode's own address (/anime/<slug>/episode/5) opens on that episode.
  const { episode: episodeParam } = useParams();
  const episodePage =
    Number(episodeParam) > 0 ? Math.floor(Number(episodeParam)) : null;
  const startAt = useMemo(() => {
    const ep = Number(query.get("ep")) || episodePage;
    const at = Number(query.get("t"));
    return ep && Number.isInteger(ep) && ep > 0
      ? { episode: ep, seconds: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0 }
      : null;
  }, [query, episodePage]);
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
          queryFn: ({ signal }) =>
            apiRequest<{ items: Character[] }>(`/anime/${id}/characters`, {
              signal,
            }).then((r) => r.items),
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
    const idle = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    const handle = idle ? idle(run, { timeout: 2500 }) : window.setTimeout(run, 1200);
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (idle && cancel) cancel(handle);
      else window.clearTimeout(handle);
    };
  }, [data?.id, client]);
  useEffect(() => {
    setEpisode(startAt?.episode ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  // Opened at an episode's address, the address follows the episode picked
  // in the player — what is on screen is what the link says. Replaced in
  // place, outside the router: the page (and the player) stay mounted.
  useEffect(() => {
    if (!data || episodePage == null || data.type === "MOVIE") return;
    const next = `/anime/${data.slug}/episode/${episode}`;
    if (window.location.pathname !== next)
      window.history.replaceState(
        window.history.state,
        "",
        `${next}${window.location.search}${window.location.hash}`,
      );
  }, [data, episode, episodePage]);

  const seoTitle = data ? labels.title(data) : "AnimeShadow";
  useDocumentHead(
    data && episodePage != null && data.type !== "MOVIE"
      ? {
          title: `${seoTitle} ${episode} серия — смотреть онлайн бесплатно | AnimeShadow`,
          description: `Смотрите ${episode} серию аниме «${seoTitle}» онлайн бесплатно в хорошем качестве.${data.episodes ? ` Всего ${data.episodes} серий.` : ""}`,
          image: data.imageLargeUrl ?? data.imageUrl,
          path: `/anime/${data.slug}/episode/${episode}`,
          type: "video.tv_show",
        }
      : data
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
            type: data.type === "MOVIE" ? "video.movie" : "video.tv_show",
            jsonLd: {
              "@context": "https://schema.org",
              "@type": data.type === "MOVIE" ? "Movie" : "TVSeries",
              name: seoTitle,
              image: data.imageLargeUrl ?? data.imageUrl ?? undefined,
              description: data.synopsis ?? undefined,
              numberOfEpisodes:
                data.type !== "MOVIE" ? (data.episodes ?? undefined) : undefined,
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
  if (isAdultRating(data.rating) && !adultOk) {
    return (
      <AgeConfirm poster={cardCover} title={title} onYes={() => setAdultOk(true)} />
    );
  }
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
        ? {
            icon: CalendarIcon,
            value: String(data.year),
            hint: t("detail.facts.aired"),
          }
        : null,
      {
        icon: TvIcon,
        value: labels.typeLabel(data.type),
        hint: t("detail.facts.format"),
      },
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
  ).filter(
    (item): item is { icon: LucideIcon; value: string; hint: string } => item != null,
  );
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
    <article className="relative isolate flex min-w-0 flex-col gap-5 sm:gap-6 [&>.full-bleed:first-child]:-mt-6 sm:[&>.full-bleed:first-child]:-mt-10">
      <TitleHeader
        key={data.id}
        // The widescreen banner is decoration behind the header, and one of
        // the largest images on the page. On a slow link the header keeps its
        // tinted surface instead.
        banner={
          !slow && data.bannerImage ? (imageSrc(data.bannerImage, 1280) ?? null) : null
        }
        fallbackBanner={
          !slow
            ? (imageSrc(
                data.screenshots.find((src) => src !== data.bannerImage),
                1280,
              ) ?? null)
            : null
        }
      >
        {/* Poster alongside everything else, not stacked in a separate
            sidebar below — the header is the one place all of a title's
            identity (art, name, rating, genres, actions) lives together.
            It sits a little higher than the text column from sm up and
            crosses the panel's top edge, which is what stops it reading as
            a stray thumbnail parked in the bottom-left corner. */}
        <div
          data-anime-hero
          className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
        >
          {/* The poster leads, at a size worth looking at. Everything else
              is a column beside it that wraps under on a phone. */}
          <div
            data-anime-poster
            className="group mx-auto w-[min(60vw,14rem)] overflow-hidden rounded-2xl bg-muted shadow-2xl shadow-black/40 ring-1 ring-border/60 sm:w-full"
          >
            <PosterImage
              key={poster}
              src={poster}
              fallbackSrc={imageSrc(cardCover)}
              title={title}
              seed={data.id}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-3">
            <div className="flex flex-col gap-1">
              {isAdultRating(data.rating) && (
                <span
                  title="Рейтинг 18+: откровенные сцены"
                  className="w-fit rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold tracking-wide text-white shadow-sm shadow-rose-900/40"
                >
                  18+
                </span>
              )}
              <h1 className="break-words font-display text-lg leading-snug text-foreground sm:text-3xl lg:text-4xl">
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {heroMeta.map(({ icon: Icon, value, hint }) => (
                <Tooltip key={hint}>
                  <TooltipTrigger asChild>
                    <span className="flex min-w-0 cursor-default items-center gap-1.5 transition-colors hover:text-foreground">
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
              <p className="hidden max-w-3xl text-sm leading-relaxed text-foreground/80 sm:line-clamp-3">
                {data.synopsis}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {data.score != null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex cursor-default items-center gap-1.5 text-sm">
                      <StarIcon className="size-4 fill-amber-400 text-amber-400" />
                      <span className="font-semibold tabular-nums">
                        {data.score.toFixed(1)}
                      </span>
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
                    data.airing === "AIRING"
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/60",
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
            <div className="grid grid-cols-2 gap-2 pt-1 [&_button]:min-w-0 [&_button]:text-xs [&_a]:text-sm sm:flex sm:flex-wrap sm:items-center sm:pt-1">
              <Button asChild size="lg" className="col-span-2 sm:col-span-1">
                <a
                  href="#watch"
                  onClick={(event) => {
                    // Down to the player smoothly, not a jump cut. On a
                    // phone the header steps aside on the way down, so
                    // the player can sit right at the top.
                    const target = document.getElementById("watch");
                    if (!target) return;
                    event.preventDefault();
                    glideTo(
                      target,
                      window.matchMedia("(min-width: 768px)").matches ? 80 : 8,
                    );
                    window.history.replaceState(window.history.state, "", "#watch");
                  }}
                >
                  <PlayIcon className="fill-current" />
                  {t("detail.sections.watch")}
                </a>
              </Button>
              <TrailerButton
                animeId={data.id}
                url={data.trailerEmbedUrl}
                title={title}
              />
              <ShareQrButton anime={data} prominent />
            </div>
          </div>
        </div>
      </TitleHeader>

      <nav
        aria-label="Разделы аниме"
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-border/60 pb-2 text-sm [scrollbar-width:none]"
      >
        {[
          ["watch", "Смотреть"],
          ["about", "Об аниме"],
          ...(hasOpenings ? [["openings", "Опенинги"]] : []),
          ["characters", "Персонажи"],
          ["discussion", "Обсуждение"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Flat sections, not one slab with everything nested inside it.
          Each of these is a thing someone came for, so each gets its own
          card and its own heading rather than being a row inside the
          player's container. */}
      {/* On a phone the section runs edge to edge and the player with it;
          the list and score bar go under the picture, which comes first. */}
      <Panel
        id="watch"
        icon={MonitorPlayIcon}
        title={t("detail.sections.watch")}
        className="min-w-0 max-sm:p-2.5"
      >
        <WatchSection anime={data} title={title} active episode={episode} onEpisodeChange={setEpisode} startAt={startAt} />
      </Panel>

      <GuestPlayerBanner />

      {/* Under the player: on the left what the title is (the description)
          and what viewers did with it (their marks, beside it on a wide
          screen); on the right, one column of the viewer's own things — the
          list and score, how long it takes, and the facts. On a phone it is
          all one column: the list first, then the rest. */}
      {/* Each column flows independently; lower sections fill the main column. */}
      <DetailsGrid anime={data} title={title} oneLiner={oneLiner} onOpeningsAvailable={onOpeningsAvailable}>

        {/* Everything below the player loads when it's about to be seen —
            its requests included — not all at once when the page opens. */}
        <div id="characters" className="min-w-0 scroll-mt-20">
          <WhenNear>
            <CharactersPanelM animeId={data.id} />
          </WhenNear>
        </div>

        <WhenNear minHeight={200}>
          <FranchisePanelM anime={data} />
        </WhenNear>

        <WhenNear>
          <RelatedSectionM anime={data} />
        </WhenNear>

        <div id="discussion" className="min-w-0 scroll-mt-20">
          <WhenNear minHeight={400}>
            <Panel icon={MessagesSquareIcon} title={t("comments.heading")}>
              <CommentsSectionM animeId={data.id} />
            </Panel>
          </WhenNear>
        </div>
      </DetailsGrid>
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
  fallbackBanner,
  children,
}: {
  /** AniList's own widescreen key visual, when the title has one. */
  banner: string | null;
  fallbackBanner: string | null;
  children: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const image = [banner, fallbackBanner].find((src) => src && !failed.includes(src));

  return (
    <div className="full-bleed relative isolate overflow-hidden border-b border-border/60 bg-card">
      <div aria-hidden className="absolute inset-0 -z-10">
        {image ? (
          // A real landscape key visual, framed as one — not a portrait
          // poster stretched across a 16:5 box, which is what made the old
          // backdrop read as broken rather than cinematic.
          <img
            key={image}
            src={image}
            alt=""
            fetchPriority="high"
            onError={() => setFailed((items) => [...items, image])}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth < img.naturalHeight)
                setFailed((items) => [...items, image]);
            }}
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
      <div className="relative mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-8 lg:py-10">
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
        "relative flex min-w-0 scroll-mt-20 flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5",
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
  fallbackSrc,
  title,
  seed,
}: {
  src: string | undefined;
  fallbackSrc?: string;
  title: string;
  seed: number;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const image = [src, fallbackSrc].find(
    (candidate) => candidate && !failed.includes(candidate),
  );
  if (!image) {
    return (
      <div className="aspect-[2/3]">
        <PosterFallback title={title} seed={seed} />
      </div>
    );
  }
  return (
    <img
      key={image}
      src={image}
      alt={title}
      className="aspect-[2/3] size-full object-cover"
      fetchPriority="high"
      onError={() => setFailed((items) => [...items, image])}
      onLoad={(event) => {
        const img = event.currentTarget;
        if (img.naturalWidth >= img.naturalHeight)
          setFailed((items) => [...items, image]);
      }}
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
function DetailsGrid({
  anime,
  title,
  oneLiner,
  onOpeningsAvailable,
  children,
}: {
  anime: AnimeDetail;
  title: string;
  oneLiner: string;
  onOpeningsAvailable: (available: boolean) => void;
  children: React.ReactNode;
}) {
  const { data: stats } = useAnimeStats(anime.id);
  const audience = stats != null && AUDIENCE_KEYS.some(({ key }) => stats[key] != null);
  const frames = useAnimeFrames(anime.id);
  const hasFrames = (frames.data?.length ?? 0) > 0;
  const watchTime = hasWatchTime(anime);
  return (
    <div
      id="about"
      className="grid min-w-0 scroll-mt-20 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      {/* Two columns on a wide screen: the description beside the frames,
          the facts beside the viewers' marks. Whatever is missing, its
          neighbour takes the whole row — no empty cells. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-1 flex min-w-0 flex-col gap-4">
        <div className="min-w-0">
          <AboutBlockM anime={anime} oneLiner={oneLiner} />
        </div>
        {hasFrames && (
          <div className="min-w-0 [&>*]:h-full">
            <FramesPanel frames={frames.data!} title={title} />
          </div>
        )}
        {audience && (
          <div className="min-w-0 [&>*]:h-full">
            <AudiencePanel animeId={anime.id} />
          </div>
        )}
        </div>
        <div className="order-3 flex min-w-0 flex-col gap-4">{children}</div>
      </div>
      <aside className="order-2 flex min-w-0 flex-col gap-4 self-start lg:order-none">
        <WhenNear minHeight={0} margin={700}>
          <AnimeOpenings key={anime.id} animeId={anime.id} title={title} href={animeUrl(anime)} poster={anime.imageLargeUrl ?? anime.imageUrl} onAvailable={onOpeningsAvailable} />
        </WhenNear>
        <TitleTracker anime={anime} title={title} />
        <InfoSidebarM anime={anime} />
        <TitleNames anime={anime} />
        {watchTime && <WatchTimeCard anime={anime} />}
      </aside>
    </div>
  );
}

/** Existing metadata only: useful for finding an edit or discussing a title elsewhere. */
function TitleNames({ anime }: { anime: AnimeDetail }) {
  const names = [
    ...new Set(
      [anime.titleLocalized, anime.title, anime.titleJapanese].filter(
        (name): name is string => Boolean(name?.trim()),
      ),
    ),
  ];
  return (
    <details className="rounded-xl border border-border/60 bg-card/30 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Названия для поиска
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Удобно искать обсуждения, мангу или поделиться названием с другом.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {names.map((name) => (
          <li
            key={name}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary/30 px-2 py-1"
          >
            <span className="min-w-0 flex-1 break-words text-xs leading-relaxed">
              {name}
            </span>
            <button
              type="button"
              aria-label={`Скопировать название: ${name}`}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(name)
                  .then(() => toast.success("Название скопировано"))
                  .catch(() => toast.error("Не удалось скопировать название"));
              }}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary"
            >
              <CopyIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </details>
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
    queryFn: ({ signal }) =>
      apiRequest<{ frames: string[] }>(`/anime/${animeId}/frames?v=2`, { signal }).then(
        (r) => r.frames,
      ),
  });
}

/**
 * Frames from the anime, beside the description: six small stills, lazy
 * loaded; a click opens one large, arrows step through them.
 */
function FramesPanel({ frames, title }: { frames: string[]; title: string }) {
  const shown = frames.slice(0, 6);
  const [open, setOpen] = useState<number | null>(null);
  const step = (d: number) =>
    setOpen((i) => (i == null ? i : (i + d + shown.length) % shown.length));
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
            <img
              src={framed(src, 360)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">Кадр из «{title}»</DialogTitle>
          {open != null && (
            <div className="relative bg-black">
              <img
                src={framed(shown[open]!)}
                alt=""
                className="max-h-[80dvh] w-full object-contain"
              />
              {shown.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Предыдущий"
                    onClick={() => step(-1)}
                    className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-primary"
                  >
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Следующий"
                    onClick={() => step(1)}
                    className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-primary"
                  >
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
    return value == null
      ? []
      : [{ key: key as string, strength: strength as number, value }];
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
  const MINE: Record<string, string> = {
    completed: "COMPLETED",
    watching: "WATCHING",
    planToWatch: "PLANNED",
    onHold: "ON_HOLD",
    dropped: "DROPPED",
  };
  const focus = hovered ?? picked;
  const focused = rows.find((r) => r.key === focus);
  const label = (key: string) =>
    t(`detail.audienceStats.${key}` as "detail.audienceStats.watching");

  return (
    <Panel icon={UsersIcon} title="Зрители">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none tabular-nums">
            {focused
              ? `${Math.round((focused.value / sum) * 100)}%`
              : labels.compact(data.total ?? sum)}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {focused
              ? `${label(focused.key)} · ${labels.compact(focused.value)}`
              : "в списках у зрителей"}
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
            style={{
              width: `${(row.value / sum) * 100}%`,
              background: tint(row.key),
              opacity: focus && focus !== row.key ? 0.25 : 1,
            }}
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
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: tint(row.key) }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground/85">
                  {label(row.key)}
                </span>
                {isMine && (
                  <span className="rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                    вы
                  </span>
                )}
                <span className="tabular-nums text-muted-foreground">
                  {Math.round((row.value / sum) * 100)}%
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {labels.compact(row.value)}
                </span>
              </button>
              <span
                aria-hidden
                className="mx-2 mt-1 block h-1 overflow-hidden rounded-full bg-foreground/[0.06]"
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${Math.max(2, (row.value / Math.max(...rows.map((r) => r.value))) * 100)}%`,
                    background: tint(row.key),
                  }}
                />
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
const CHARACTERS_COLLAPSED = 6;
const CHARACTERS_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";

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
      Number(b.role.toLowerCase() === "main") - Number(a.role.toLowerCase() === "main"),
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
  const visible =
    searching || expanded ? matched : matched.slice(0, CHARACTERS_COLLAPSED);
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
              className="h-10 w-full rounded-xl border border-border/60 bg-card/40 pl-8 pr-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-48"
            />
          </div>
        )}
      </div>

      {isPending ? (
        <div className={CHARACTERS_GRID}>
          {Array.from({ length: CHARACTERS_COLLAPSED }, (_, i) => (
            <div
              key={i}
              className="flex h-16 items-center gap-2 rounded-xl border border-border/50 p-2"
            >
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <Skeleton className="h-3 w-16 rounded" />
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
          <CharacterModal
            character={selected}
            onOpenChange={(open) => !open && setSelected(null)}
          />
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

/** The same full-bleed shape the homepage hero's own skeleton uses, so the
 *  page doesn't jump from one silhouette to a completely different one the
 *  moment the title's data actually arrives. */
function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 [&>.full-bleed:first-child]:-mt-6 sm:[&>.full-bleed:first-child]:-mt-10">
      <div className="full-bleed border-b border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5">
            <Skeleton className="mx-auto aspect-[2/3] w-[min(60vw,14rem)] shrink-0 rounded-2xl sm:mx-0 sm:w-40 lg:w-48" />
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
