
import type { AnimeSummary } from "@animeshadow/shared";
import { Link } from "react-router-dom";
import { AnimeRail } from "@/components/anime/anime-rail";
import {
  SpotlightHero,
  SpotlightHeroSkeleton,
} from "@/components/anime/spotlight-hero";
import { GenreCards } from "@/components/anime/genre-cards";
import { HomeActions } from "@/components/anime/home-actions";
import { AnimeCorner } from "@/components/home/anime-corner";
import { ErrorState } from "@/components/common/states";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useHomeGenres } from "@/lib/home-genres";
import {
  useContinueWatching,
  useDiscover,
  useHomeRecommendations,
} from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";
import { FEATURES } from "@/lib/features";
import { WhenNear } from "@/components/common/when-near";

/**
 * Homepage rail order is a deliberate hierarchy, not an arbitrary list:
 * pick up where you left off, then what's hot right now (ours, then the
 * wider community's), then this season, then sustained popularity, then a
 * way to jump sideways (genres), then a personal pick, and finally the
 * long-run community consensus. Nine sections total including the hero —
 * not ten near-identical carousels.
 */
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
  const homeGenres = useHomeGenres();
  const { data: cont } = useContinueWatching(isAuthed);
  const { data: recs, isPending: recsPending } = useHomeRecommendations();

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
  // A face for each genre card, from lists this page already loaded.
  const posterPool = [
    ...(data?.trendingNow ?? []),
    ...(data?.trendingMonth ?? []),
    ...(data?.mostPopular ?? []),
    ...(data?.allTimeTop ?? []),
    ...(data?.topAiring ?? []),
    ...(data?.thisSeason ?? []),
  ];
  // A few real titles per genre for the hover list, deduplicated because
  // the six lists above overlap heavily, and taken in the order they were
  // loaded so the best-known ones come first.
  const topFor = (genreName: string) => {
    const seen = new Set<number>();
    const picks: AnimeSummary[] = [];
    for (const anime of posterPool) {
      if (picks.length === 5) break;
      if (seen.has(anime.id) || !anime.genres.includes(genreName)) continue;
      seen.add(anime.id);
      picks.push(anime);
    }
    return picks;
  };
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-12 [&>section.full-bleed:first-child]:-mt-6 sm:[&>section.full-bleed:first-child]:-mt-10">

      {/* Full-bleed, so it meets the header above it and the first rail
          below without the page's gutters showing through. The negative
          top margin cancels the shell's own top padding. */}
      {isPending || !data ? (
        <SpotlightHeroSkeleton />
      ) : (data.spotlights?.length ?? 0) > 0 ? (
        <SpotlightHero items={data.spotlights} />
      ) : data.spotlight ? (
        <SpotlightHero items={[data.spotlight]} />
      ) : null}

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
        title={t("home.season", { year: currentYear })}
        subtitle={t("home.seasonSub")}
        items={data?.thisSeason ?? []}
        loading={isPending}
        href="/browse?airing=AIRING&orderBy=start_date"
      />
      {/* From here down nothing is laid out, painted or animated until it
          scrolls near — the homepage used to render ~6,000 nodes up front. */}
      <div className="cv-auto">
      <AnimeRail
        title={t("home.trendingMonth")}
        subtitle={t("home.trendingMonthSub")}
        items={data?.trendingMonth ?? []}
        loading={isPending}
        href="/browse?orderBy=popularity"
      />
      </div>

      <HomeActions />

      {FEATURES.homeGenres && (
      <div className="cv-auto">
      <GenreCards
        title={t("home.genresTitle")}
        genres={homeGenres.genres}
        personal={homeGenres.personal}
        label={labels.genreLabel}
        topFor={topFor}
        countLabel={(count) => t("home.genreCount", { count })}
        previewLabel={t("home.genrePreview")}
      />
      </div>
      )}

      {/* Something to do rather than something to scroll past — built from
          the titles this page already loaded. */}
      {/* The game fetches a round and the leaderboard — only once it's
          about to be on screen. */}
      <WhenNear minHeight={420}>
        <div className="cv-auto">
          <AnimeCorner />
        </div>
      </WhenNear>


      <div className="cv-auto">
      <AnimeRail
        title={t("home.recommended")}
        subtitle={
          !isAuthed ? (
            t("home.recommendedSubAnon")
          ) : recs?.basis === "liked" ? (
            t("home.recommendedSubLiked")
          ) : recs?.basis === "preferences" ? (
            t("home.recommendedSub")
          ) : recs?.basis === "history" ? (
            t("home.recommendedSubHistory")
          ) : (
            // Signed in, but nothing to personalise from yet — this is the
            // one case that's actually actionable, so it's the one case
            // that gets a link instead of just describing the situation.
            <>
              {t("home.recommendedSubTrending")}{" "}
              <Link to="/recommendations" className="text-primary hover:underline">
                {t("recommendations.eyebrow")}
              </Link>
            </>
          )
        }
        items={recs?.items ?? data?.mostPopular ?? []}
        loading={recsPending && !recs}
        href="/browse?orderBy=popularity"
      />
      <AnimeRail
        title={t("home.topRated")}
        subtitle={t("home.topRatedSub")}
        items={data?.allTimeTop ?? []}
        loading={isPending}
        href="/browse?orderBy=score"
      />
      </div>

    </div>
  );
}

