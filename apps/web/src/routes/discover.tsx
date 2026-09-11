import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimeRail } from "@/components/anime/anime-rail";
import {
  SpotlightCarousel,
  SpotlightSkeleton,
} from "@/components/anime/spotlight";
import { ErrorState } from "@/components/common/states";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import {
  useContinueWatching,
  useDiscover,
  useGenres,
  useHomeRecommendations,
} from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";

export function Component() {
  const t = useT();
  const { status } = useAuth();
  useDocumentHead({
    title: "AnimeShadow — смотреть аниме онлайн",
    description:
      "Каталог аниме на русском: обзоры, рейтинги, список просмотра и прогресс по эпизодам. Смотрите онлайн.",
    path: "/",
  });
  const isAuthed = status === "authenticated";
  const { data, isPending, isError, refetch } = useDiscover();
  const { data: genres } = useGenres();
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
  const topGenres = (genres ?? []).slice(0, 14);

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
                {g.name}
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
        title={t("home.popularWeek")}
        subtitle={t("home.popularWeekSub")}
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
      <AnimeRail
        title={t("home.topRated")}
        subtitle={t("home.topRatedSub")}
        items={data?.allTimeTop ?? []}
        loading={isPending}
        href="/browse?orderBy=score"
      />
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
