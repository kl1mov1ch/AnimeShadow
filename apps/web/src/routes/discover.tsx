import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimeGrid } from "@/components/anime/anime-grid";
import { AnimeRail } from "@/components/anime/anime-rail";
import { ProgressEmpty, ProgressRow } from "@/components/anime/progress-row";
import {
  SpotlightCarousel,
  SpotlightSkeleton,
} from "@/components/anime/spotlight";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import {
  useContinueWatching,
  useDiscover,
  useGenres,
  useHomeRecommendations,
  useMyProgress,
} from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";

export function Component() {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  useDocumentHead({
    title: t("seo.homeTitle"),
    description: t("seo.homeDescription"),
    path: "/",
  });
  const isAuthed = status === "authenticated";
  const { data, isPending, isError, refetch } = useDiscover();
  const { data: genres } = useGenres();
  const { data: cont } = useContinueWatching(isAuthed);
  const { data: recs, isPending: recsPending } = useHomeRecommendations();
  const { data: history, isPending: historyPending } = useMyProgress(isAuthed);

  if (isError) {
    return (
      <div className="py-10">
        <ErrorState
          title={t("discover.error")}
          message={t("discover.errorBody")}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const continueItems = (cont?.items ?? []).map((i) => i.anime);
  const topGenres = (genres ?? []).slice(0, 14);
  const historyRows = (history ?? []).slice(0, 6);

  return (
    <div className="flex flex-col gap-12">
      {!isAuthed && <FirstVisitStrip />}

      {isPending || !data ? (
        <SpotlightSkeleton />
      ) : (data.spotlights?.length ?? 0) > 0 ? (
        <SpotlightCarousel items={data.spotlights} />
      ) : data.spotlight ? (
        <SpotlightCarousel items={[data.spotlight]} />
      ) : null}

      {topGenres.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg tracking-tight sm:text-xl">
            {t("home.genresTitle")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {topGenres.map((g, i) => (
              <Link
                key={g.id}
                to={`/browse?genres=${g.id}`}
                className="reveal rounded-full border border-border/60 bg-card/40 px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                style={{ "--i": i % 8 } as CSSProperties}
              >
                {labels.genreLabel(g.name)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAuthed && continueItems.length > 0 && (
        <AnimeRail
          title={t("home.continueRail")}
          subtitle={t("home.continueRailSub")}
          items={continueItems}
          href="/library"
        />
      )}

      <AnimeRail
        title={t("home.trendingNow")}
        subtitle={t("home.trendingNowSub")}
        items={data?.trendingNow ?? []}
        loading={isPending}
        href="/browse?orderBy=popularity"
      />
      <AnimeRail
        title={t("home.trendingMonth")}
        subtitle={t("home.trendingMonthSub")}
        items={data?.trendingMonth ?? []}
        loading={isPending}
        href="/browse?orderBy=popularity"
      />
      <AnimeRail
        title={t("home.topRated")}
        subtitle={t("home.topRatedSub")}
        items={data?.allTimeTop ?? []}
        loading={isPending}
        href="/browse?orderBy=score"
      />
      <AnimeRail
        title={t("home.airingNow")}
        subtitle={t("home.airingNowSub")}
        items={data?.topAiring ?? []}
        loading={isPending}
        href="/browse?airing=AIRING&orderBy=popularity"
      />
      <AnimeRail
        title={t("home.newEpisodes")}
        subtitle={t("home.newEpisodesSub")}
        items={data?.thisSeason ?? []}
        loading={isPending}
        href="/browse?airing=AIRING&orderBy=start_date"
      />

      {/* Stretched palette-tinted rows instead of posters — a "coming soon"
          ticker reads better as a scannable list than as a carousel. */}
      {(isPending || (data?.upcoming?.length ?? 0) > 0) && (
        <HomeSection
          title={t("home.upcoming")}
          subtitle={t("home.upcomingSub")}
          href="/browse?airing=UPCOMING"
        >
          {isPending ? (
            <AnimeGridSkeletonRow count={4} view="list" />
          ) : (
            <AnimeGrid
              items={(data?.upcoming ?? []).slice(0, 6)}
              view="list"
            />
          )}
        </HomeSection>
      )}

      <AnimeRail
        title={t("home.recommended")}
        subtitle={
          !isAuthed
            ? t("home.recommendedSubAnon")
            : recs?.basis === "preferences"
              ? t("home.recommendedSub")
              : recs?.basis === "history"
                ? t("home.recommendedSubHistory")
                : t("home.recommendedSubAnon")
        }
        items={recs?.items ?? data?.mostPopular ?? []}
        loading={recsPending && !recs}
        href="/browse?orderBy=popularity"
      />

      {/* Watch history closes the page — a vertical list, deliberately not
          another rail, so the homepage doesn't end the way it started. */}
      {isAuthed && (
        <HomeSection
          title={t("home.watchHistory")}
          subtitle={t("home.watchHistorySub")}
          href="/profile?tab=progress"
        >
          {historyPending ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : historyRows.length === 0 ? (
            <ProgressEmpty />
          ) : (
            <div className="flex flex-col gap-3">
              {historyRows.map((row) => (
                <ProgressRow key={row.animeId} row={row} />
              ))}
            </div>
          )}
        </HomeSection>
      )}
    </div>
  );
}

/**
 * Same header treatment as `AnimeRail` (title, subtitle, "browse" link) but
 * without the scroll-nudge arrows — for sections that aren't a horizontal
 * track (a grid, a vertical list).
 */
function HomeSection({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
            <Link to={href}>{t("common.browseCatalogue")}</Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function AnimeGridSkeletonRow({
  count,
  view = "grid",
}: {
  count: number;
  view?: "grid" | "list";
}) {
  if (view === "list") {
    return (
      <div className="flex flex-col gap-2.5" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl sm:h-36" />
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
      ))}
    </div>
  );
}

function FirstVisitStrip() {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("animeshadow.fv") === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
      <span aria-hidden className="text-lg text-primary">
        影
      </span>
      <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
        <span className="font-medium">{t("home.firstVisit.title")}</span>
        <span className="text-muted-foreground">{t("home.firstVisit.text")}</span>
      </div>
      <Link
        to="/about"
        className="shrink-0 font-medium text-primary hover:text-primary/80"
      >
        {t("home.firstVisit.link")}
      </Link>
      <button
        type="button"
        aria-label={t("common.close")}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("animeshadow.fv", "1");
          } catch {
            /* ignore */
          }
        }}
      >
        ✕
      </button>
    </div>
  );
}
