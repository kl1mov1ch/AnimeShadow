import { useCallback, useMemo } from "react";
import { CtaSection } from "@/components/home/cta-section";
import { FeatureSection } from "@/components/home/feature-section";
import { GenreSection } from "@/components/home/genre-section";
import { HeroSection } from "@/components/home/hero-section";
import { HomeFooter } from "@/components/home/home-footer";
import { HomeHeader } from "@/components/home/home-header";
import { PopularSection } from "@/components/home/popular-section";
import { StatsSection } from "@/components/home/stats-section";
import { SubscriptionSection } from "@/components/home/subscription-section";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useDiscover, useGenres } from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";

/*
 * THE LANDING HOMEPAGE — built from the mock, kept whole but not routed.
 *
 * The site's homepage is routes/discover.tsx (the rail-based one). To put
 * this landing back, point the index route at it in src/router.tsx:
 *   { index: true, lazy: () => import("@/routes/home-landing") }
 * and restore the "landing" exception in components/layout/app-shell.tsx,
 * which stands the global header and footer down for it.
 */

/**
 * The homepage, rebuilt as a landing page: one cinematic banner, then the
 * rows that sell the site — popular titles, genres, what we offer, the
 * numbers, the plans, and a closing invitation.
 *
 * It carries its own header and footer (AppShell stands its global ones
 * down on "/"), and its own dark palette, so nothing on any other page
 * changes. Artwork is deliberately placeholders that hold the final
 * images' aspect ratios — see ArtPlaceholder in components/home/home-ui.
 *
 * The previous rail-based homepage is kept, working, in
 * routes/discover-legacy.tsx.
 */
/**
 * The genres the homepage offers: the everyday ones people browse by.
 * Harem, ecchi, hentai and the rest of that shelf are deliberately absent —
 * the catalogue still has them, the front door does not lead with them.
 */
const HOME_GENRES = new Set([
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Supernatural",
  "Mystery",
  "Sports",
  "Shounen",
  "School",
  "Mecha",
  "Music",
  "Horror",
]);

export function Component() {
  const t = useT();
  const labels = useLabels();
  useDocumentHead({
    title: t("seo.homeTitle"),
    description: t("seo.homeDescription"),
    path: "/",
  });

  const { data } = useDiscover();
  const { data: genres } = useGenres();

  const hero = data?.spotlights?.length ? data.spotlights : data?.spotlight ? [data.spotlight] : [];
  // Three shelves for the popular block: what is being watched right now,
  // what this season brought, and the standing favourites.
  const shelves = useMemo(
    () => ({
      trending: data?.trendingNow?.length ? data.trendingNow : (data?.topAiring ?? []),
      season: data?.thisSeason ?? [],
      top: data?.allTimeTop?.length ? data.allTimeTop : (data?.mostPopular ?? []),
    }),
    [data],
  );

  // A face for each genre card, taken from lists this page already has —
  // the best-known title that carries that genre. No extra requests.
  const pool = useMemo(
    () => [
      ...(data?.trendingNow ?? []),
      ...(data?.trendingMonth ?? []),
      ...(data?.mostPopular ?? []),
      ...(data?.allTimeTop ?? []),
      ...(data?.topAiring ?? []),
      ...(data?.thisSeason ?? []),
    ],
    [data],
  );
  const posterFor = useCallback(
    (genreName: string) => pool.find((anime) => anime.genres.includes(genreName)),
    [pool],
  );

  /**
   * Which genres to show, and in what order. Ordered by what our own
   * visitors are actually watching (the trending lists are real watch
   * activity), with the catalogue's own size as the tie-breaker — not by
   * how many titles a genre happens to have. Kept to the everyday
   * categories: adult and fan-service genres are not homepage material.
   */
  const homeGenres = useMemo(() => {
    const watched = new Map<string, number>();
    const weigh = (list: typeof pool | undefined, weight: number) => {
      for (const anime of list ?? []) {
        for (const name of anime.genres) watched.set(name, (watched.get(name) ?? 0) + weight);
      }
    };
    weigh(data?.trendingNow, 3);
    weigh(data?.trendingMonth, 2);
    weigh(data?.mostPopular, 1);

    return (genres ?? [])
      .filter((g) => HOME_GENRES.has(g.name))
      .sort(
        (a, b) =>
          (watched.get(b.name) ?? 0) - (watched.get(a.name) ?? 0) || (b.count ?? 0) - (a.count ?? 0),
      );
  }, [genres, data]);

  return (
    <div className="home-theme min-h-dvh">
      <HomeHeader />
      <main>
        <HeroSection slides={hero} />
        <PopularSection shelves={shelves} />
        {/* Everything below the first two screens is skipped by the
            browser — no layout, no paint, no running animations — until
            it scrolls near. */}
        <div className="cv-auto">
          <GenreSection genres={homeGenres} label={labels.genreLabel} posterFor={posterFor} />
        </div>
        <div className="cv-auto">
          <FeatureSection />
        </div>
        <div className="cv-auto">
          <StatsSection />
        </div>
        <div className="cv-auto">
          <SubscriptionSection />
        </div>
        <div className="cv-auto">
          <CtaSection />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
