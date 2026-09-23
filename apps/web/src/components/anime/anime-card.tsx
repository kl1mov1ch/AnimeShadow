import type { AnimeSummary } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { BookmarkCheckIcon, BookmarkPlusIcon, ClockIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { ScoreBadge } from "@/components/anime/score-badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating } from "@/hooks/use-adult-content";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLocale, useT } from "@/i18n";
import { useSlowConnection } from "@/lib/connection";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { animeQueryOptions, useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";

interface AnimeCardProps {
  anime: AnimeSummary;
  /** Eager-load the poster for above-the-fold cards. */
  priority?: boolean;
  className?: string;
}

/** "PG-13 - Teens 13 or older" / "r_plus" -> "PG-13" / "R+". */
function shortRating(rating: string | null): string | null {
  const head = rating?.split(" - ")[0]?.trim();
  if (!head) return null;
  return head.replace(/_plus$/i, "+").replace(/_/g, "-").toUpperCase();
}

/** Days/hours until an ISO release date, or null when it's past / unknown. */
function useReleaseCountdown(airedFrom: string | null): string | null {
  const t = useT();
  if (!airedFrom) return null;
  const ts = Date.parse(airedFrom);
  if (!Number.isFinite(ts)) return null;
  const diff = ts - Date.now();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / 86_400_000);
  if (days > 1) return t("card.countdownDays", { days });
  const hours = Math.ceil(diff / 3_600_000);
  return hours > 0 ? t("card.countdownHours", { hours }) : t("card.countdownSoon");
}

/** Much shorter than the opening's delay: prefetching the page is cheap (one
 *  small JSON response and a JS chunk), and the gain — a title page that
 *  opens instantly — is only worth anything if it lands before the click. */
const PREFETCH_HOVER_INTENT_MS = 150;

export function AnimeCard({ anime, priority = false, className }: AnimeCardProps) {
  const t = useT();
  const labels = useLabels();
  const canHover = useMediaQuery("(hover: hover)");
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";
  const { data: libraryEntries } = useLibrary(undefined, isAuthed);
  const addToLibrary = useUpsertLibraryEntry();
  const inLibrary = libraryEntries?.some((entry) => entry.anime.id === anime.id) ?? false;
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetched = useRef(false);
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const slow = useSlowConnection();

  /**
   * Starts loading the title page while the cursor is still on the card, so
   * that by the time it is clicked there is nothing left to wait for. Skipped
   * on a slow connection, where spending bandwidth on a page that may never
   * be opened would slow down the one that is actually on screen.
   */
  const prefetch = () => {
    if (prefetched.current || slow) return;
    prefetched.current = true;
    // The route's code first: nothing can render until that chunk arrives.
    void import("@/routes/anime-detail");
    // Same key the page itself reads — see animeQueryOptions.
    void queryClient.prefetchQuery(animeQueryOptions(anime.slug || anime.id, locale));
  };

  const startIntent = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(prefetch, PREFETCH_HOVER_INTENT_MS);
  };
  const cancelIntent = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  };
  useEffect(() => () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }, []);

  /**
   * "Keep this one", straight from the card: anything not tracked yet goes
   * into the plan-to-watch list. Signed out, it invites a sign-in rather
   * than quietly doing nothing; already tracked, it opens the list.
   */
  const keep = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthed) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    if (inLibrary) {
      navigate("/library");
      return;
    }
    addToLibrary.mutate(
      { animeId: anime.id, input: { status: "PLANNED", score: null, notes: null } },
      {
        onSuccess: () =>
          toast.success(t("library.savedStatus", { title, status: t("status.PLANNED") })),
        onError: () => toast.error(t("library.saveError")),
      },
    );
  };
  const title = labels.title(anime);
  const when = labels.seasonYearLabel(anime);
  const episodes = labels.episodeLabel(anime.episodes, anime.type);
  const metaLine = [labels.typeLabel(anime.type), episodes].filter(Boolean).join(" · ");
  const genreLine = anime.genres.slice(0, 2).map(labels.genreLabel).join(", ");

  // const hasScore = anime.score != null;
  const airing = anime.airing === "AIRING";
  const unreleased = anime.airing === "UPCOMING";
  const countdown = useReleaseCountdown(anime.airedFrom);
  const isAdult = isAdultRating(anime.rating);

  const card = (
    <article className={cn("group flex flex-col gap-2", className)}>
      <div
        // Not even attached on a touch device: there is no hover to intend,
        // OpeningVideo would refuse to render, and the request is disabled —
        // so the only thing these could do there is churn state on a tap.
        {...(canHover ? { onMouseEnter: startIntent, onMouseLeave: cancelIntent } : {})}
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/60 bg-muted transition-[border-color,transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-lg group-hover:shadow-primary/10 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      >
        {/* Everything below is opacity/transform only — nothing that forces
            a repaint on scroll — and all of it sits behind `group-hover:`,
            which Tailwind v4 compiles into `@media (hover: hover)`, so a
            phone never runs any of it. */}
        {anime.imageUrl ? (
          // Two variants, picked by the browser before anything is fetched.
          //
          // The large one (225x318 from Shikimori, 319x450 from MAL) is what
          // a 2:3 poster actually needs on a desktop grid — the small one is
          // Shikimori's 160px "preview" and visibly upscales there. But large
          // costs ~60KB against ~27KB, and a phone showing two columns of
          // them pays that over and over on a connection that can least
          // afford it. Below `sm` the small one is served instead: softer,
          // less than half the bytes.
          <picture>
            <source media="(max-width: 639px)" srcSet={imageSrc(anime.imageUrl)} />
            <img
              // On a slow connection the small variant everywhere, not just on
              // narrow screens: a desktop on a weak link pays for bytes the
              // same as a phone does.
              src={imageSrc(slow ? anime.imageUrl : anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
          </picture>
        ) : (
          <PosterFallback title={title} seed={anime.id} />
        )}

        {/* The poster itself is the link. It is stretched under the buttons
            rather than wrapped around them, because a button inside a link
            is neither valid nor clickable in peace. */}
        <Link
          to={animeHref(anime)}
          viewTransition
          aria-label={title}
          className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {/* One move, not three. The play disc is gone: with the opening
            itself running behind this, a badge in the middle of the picture
            was covering the very thing it was inviting you to look at, and
            saying "playable" over footage that is already playing. What's
            left is a gentle darkening from the bottom, which exists only so
            the countdown and "coming soon" badges keep their contrast once
            the video underneath them starts moving. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        />

        {/* A band of light crossing the poster on hover. One transform on
            one element — nothing here repaints the picture underneath. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 -translate-x-[220%] -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out will-change-transform group-hover:translate-x-[420%] motion-reduce:hidden"
        />

        {/* One action on the poster: keep it for later. Slides in under a
            hover; on a touch screen, where there is no hover to wait for, it
            simply stays out. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={keep}
              disabled={addToLibrary.isPending}
              aria-label={inLibrary ? t("card.inList") : t("card.addToList")}
              className={cn(
                "absolute right-2 z-20 grid size-9 place-items-center rounded-full border border-white/15 backdrop-blur transition-all duration-300 hover:scale-110 active:scale-90 motion-reduce:transition-none",
                isAdult ? "top-10" : "top-2",
                inLibrary ? "bg-primary/90 text-primary-foreground" : "bg-black/60 text-white",
                canHover
                  ? "translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
                  : "opacity-100",
              )}
            >
              {inLibrary ? (
                <BookmarkCheckIcon className="size-4" />
              ) : (
                <BookmarkPlusIcon className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {inLibrary ? t("card.inList") : t("card.addToList")}
          </TooltipContent>
        </Tooltip>

        {isAdult && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-rose-600/90 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            18+
          </span>
        )}

        {/* Top-left: what the title is rated — and, while it has no rating
            yet, how long until it airs. */}
        {anime.score != null && (
          <ScoreBadge score={anime.score} className="absolute left-2 top-2 z-20" />
        )}
        {anime.score == null && countdown ? (
          <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/90 backdrop-blur">
            <ClockIcon className="size-3 text-muted-foreground/70" />
            {countdown}
          </span>
        ) : null}

        {/* "Coming soon" only — the "airing" tag added noise without telling the
            user anything they don't already get from the season/year line. */}
        {unreleased ? (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {t("card.soon")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          <Link to={animeHref(anime)} viewTransition className="outline-none">
            {title}
          </Link>
        </h3>
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {metaLine}
            {airing && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-primary">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {t("airing.airingShort")}
              </span>
            )}
          </span>
          {when && <span className="shrink-0 tabular-nums">{when}</span>}
        </div>
        {(genreLine || anime.members != null) && (
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground/70">
            <span className="min-w-0 truncate">{genreLine}</span>
            {anime.members != null && anime.members > 0 && (
              <span className="shrink-0 tabular-nums">
                {t("home.views", { views: labels.compact(anime.members) })}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );

  // Touch devices have no hover to preview on — skip the extra portal/DOM
  // entirely there rather than shipping a feature that can never trigger.
  if (!canHover) return card;

  return (
    <HoverCard openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={10} className="w-64 p-3">
        <AnimeCardPreview anime={anime} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The extra detail a hover reveals — everything the compact card had no room
 * for (full genre list, synopsis) plus what's already visible, restated
 * larger. No new visual language: same badge, same type scale, just more of
 * it, so the preview reads as "the same card, unfolded" rather than a
 * different surface.
 */
/**
 * The hover preview, deliberately narrow: it repeats nothing the card
 * already shows (title, score, type, year, episodes) and carries only what
 * might decide it — what the show is about, who made it, what it is rated,
 * and how many people are watching.
 */
function AnimeCardPreview({ anime }: { anime: AnimeSummary }) {
  const t = useT();
  const labels = useLabels();
  const genreLine = anime.genres.slice(0, 4).map(labels.genreLabel).join(" · ");
  const age = shortRating(anime.rating);

  return (
    <div className="flex flex-col gap-2">
      {genreLine && <p className="text-xs text-primary/90">{genreLine}</p>}
      {anime.synopsis && (
        <p className="line-clamp-5 text-xs leading-relaxed text-foreground/80">{anime.synopsis}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        {age && <span>{age}</span>}
        {anime.scoredBy != null && anime.scoredBy > 0 && (
          <span className="tabular-nums">
            {t("common.ratings", { count: labels.compact(anime.scoredBy) })}
          </span>
        )}
        {anime.members != null && anime.members > 0 && (
          <span className="tabular-nums">
            {t("home.views", { views: labels.compact(anime.members) })}
          </span>
        )}
      </div>
    </div>
  );
}

export function AnimeCardSkeleton({ className }: { className?: string }) {
  return (
    // rounded-2xl, matching the real poster — the skeleton used to draw a
    // rounded-xl box, so every card visibly changed shape the moment its
    // data arrived.
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}
