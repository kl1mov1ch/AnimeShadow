import type { AnimeSummary } from "@animeshadow/shared";
import { HeartIcon, LoaderIcon, SearchIcon, SparklesIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useBrowse,
  useLikeAnime,
  useLikedAnime,
  useSmartSearch,
  useUnlikeAnime,
} from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * The actual configuration surface behind "Рекомендации для вас" — pick
 * titles you like (from search or the popular grid), and the home rail
 * leans on their genres from then on (see RecommendationService.homeRail).
 * Genre-only picking still lives in Profile → Settings; this is the more
 * deliberate, title-level signal.
 */
export function Component() {
  const t = useT();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const searching = debounced.trim().length >= 2;

  const { data: liked, isPending: likedPending } = useLikedAnime(isAuthed);
  const search = useSmartSearch(debounced, searching);
  const popular = useBrowse({ orderBy: "popularity", perPage: 18 }, !searching);
  const like = useLikeAnime();
  const unlike = useUnlikeAnime();

  if (authStatus !== "loading" && !isAuthed) {
    return (
      <EmptyState
        title={t("recommendations.signedOutTitle")}
        description={t("recommendations.signedOutBody")}
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("common.createAccount")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const likedIds = new Set((liked ?? []).map((a) => a.id));

  const toggle = (anime: AnimeSummary) => {
    if (likedIds.has(anime.id)) unlike.mutate(anime.id);
    else like.mutate(anime.id);
  };

  const searchResults = (search.data?.flat ?? []).filter((a) => !likedIds.has(a.id));
  const popularResults = (popular.data?.items ?? []).filter((a) => !likedIds.has(a.id));

  return (
    <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-8 py-6">
      <header className="reveal flex flex-col gap-2" style={{ "--i": 0 } as CSSProperties}>
        <div className="flex items-center gap-2 text-primary">
          <SparklesIcon className="size-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            {t("recommendations.eyebrow")}
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl">{t("recommendations.title")}</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("recommendations.lead")}
        </p>
      </header>

      <div className="reveal relative" style={{ "--i": 1 } as CSSProperties}>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("recommendations.searchPlaceholder")}
          className="h-11 w-full rounded-lg border bg-card pl-10 pr-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      {searching ? (
        <section className="reveal flex flex-col gap-3" style={{ "--i": 2 } as CSSProperties}>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("recommendations.searchResults")}
          </h2>
          {search.isFetching && searchResults.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              {t("search.searching")}…
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t("search.noMatches")}</p>
          ) : (
            <TitleGrid items={searchResults} liked={false} onToggle={toggle} />
          )}
        </section>
      ) : (
        <>
          <section className="reveal flex flex-col gap-3" style={{ "--i": 2 } as CSSProperties}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("recommendations.likedHeading", { count: liked?.length ?? 0 })}
              </h2>
            </div>
            {likedPending ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderIcon className="size-4 animate-spin" />
              </div>
            ) : !liked || liked.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
                {t("recommendations.likedEmpty")}
              </p>
            ) : (
              <TitleGrid items={liked} liked onToggle={toggle} />
            )}
          </section>

          <section className="reveal flex flex-col gap-3" style={{ "--i": 3 } as CSSProperties}>
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("recommendations.popularHeading")}
            </h2>
            <TitleGrid items={popularResults} liked={false} onToggle={toggle} />
          </section>
        </>
      )}

      <p className="reveal text-xs text-muted-foreground/70" style={{ "--i": 4 } as CSSProperties}>
        {t("recommendations.genreHint")}{" "}
        <Link to="/profile?tab=settings" className="text-primary hover:underline">
          {t("profile.tabs.settings")}
        </Link>
      </p>
    </div>
  );
}

function TitleGrid({
  items,
  liked,
  onToggle,
}: {
  items: AnimeSummary[];
  liked: boolean;
  onToggle: (anime: AnimeSummary) => void;
}) {
  const t = useT();
  const labels = useLabels();

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items.map((anime) => (
        <button
          key={anime.id}
          type="button"
          onClick={() => onToggle(anime)}
          aria-pressed={liked}
          aria-label={
            liked
              ? t("recommendations.unlike", { title: labels.title(anime) })
              : t("recommendations.like", { title: labels.title(anime) })
          }
          className="group flex flex-col gap-1.5 text-left outline-none"
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border/60 bg-muted transition-colors group-hover:border-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
            {anime.imageUrl ? (
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
            ) : (
              <PosterFallback title={anime.title} seed={anime.id} />
            )}
            <span
              className={cn(
                "absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full backdrop-blur transition-colors",
                liked
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/70 text-foreground/80 group-hover:text-primary",
              )}
            >
              <HeartIcon className={cn("size-3.5", liked && "fill-current")} />
            </span>
          </div>
          <span className="line-clamp-2 text-xs font-medium leading-snug">
            {labels.title(anime)}
          </span>
        </button>
      ))}
    </div>
  );
}
