import type { AnimeSummary } from "@animeshadow/shared";
import { hoverPrefetch } from "@/lib/prefetch";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  ClockIcon,
  PlayIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AnimePoster } from "@/components/anime/anime-poster";
import { ScoreBadge } from "@/components/anime/score-badge";
import { STATUS_META } from "@/components/library/library-meta";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdultRating } from "@/hooks/use-adult-content";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLocale, useT } from "@/i18n";
import { useSlowConnection } from "@/lib/connection";
import { animeHref } from "@/lib/format";
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
  const entry = libraryEntries?.find((e) => e.anime.id === anime.id) ?? null;
  const inLibrary = entry != null;
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The drawer, the light band and the play button only exist once the
  // card has been hovered. A homepage renders ~100 cards; building all of
  // that for each one — and keeping the band on its own GPU layer — was a
  // large share of what the page cost to draw and scroll.
  const [hovered, setHovered] = useState(false);
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
    if (!hovered) setHovered(true);
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
        // One slow, soft movement: a lift of a few pixels and a shadow that
        // deepens with it, on the same long ease-out as everything else on
        // the card. The red glow and the faster timing it used to have made
        // a grid of these flicker as the pointer crossed it.
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/50 bg-muted transition-[border-color,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:border-foreground/15 group-hover:shadow-xl group-hover:shadow-black/30 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      >
        {/* Everything below is opacity/transform only — nothing that forces
            a repaint on scroll — and all of it sits behind `group-hover:`,
            which Tailwind v4 compiles into `@media (hover: hover)`, so a
            phone never runs any of it. */}
        <AnimePoster anime={anime} title={title} small={slow} priority={priority} />

        {/* The poster itself is the link. It is stretched under the buttons
            rather than wrapped around them, because a button inside a link
            is neither valid nor clickable in peace. */}
        <Link
          to={animeHref(anime)}
          viewTransition
          {...hoverPrefetch(animeHref(anime).slice("/anime/".length))}
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:transition-none"
        />

        {/* Two actions on the poster, stacked: keep it for later, and go
            straight to the player. They slide in one after the other under
            a hover. A touch screen gets neither: on a phone-sized poster the
            bookmark sat on top of the score, and the whole poster already
            opens the title, where the list controls are. A title already in
            the list says so at the bottom-left either way. */}
        {canHover && (
        <div
          className={cn(
            "absolute right-2 z-20 flex flex-col gap-1.5",
            isAdult ? "top-10" : "top-2",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={keep}
                disabled={addToLibrary.isPending}
                aria-label={inLibrary ? t("card.inList") : t("card.addToList")}
                className={cn(
                  "grid size-7 place-items-center rounded-lg border border-white/10 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 motion-reduce:transition-none",
                  inLibrary ? "bg-primary/85 text-primary-foreground" : "bg-black/50 text-white/90 hover:bg-black/70 hover:text-white",
                  !inLibrary
                    ? "translate-x-1.5 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
                    : "opacity-100",
                )}
              >
                <MorphIcon
                  on={inLibrary}
                  off={BookmarkPlusIcon}
                  onIcon={BookmarkCheckIcon}
                  className="size-3.5"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {inLibrary ? t("card.inList") : t("card.addToList")}
            </TooltipContent>
          </Tooltip>
          {hovered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`${animeHref(anime)}#watch`}
                  viewTransition
                  aria-label={t("card.watch")}
                  className="grid size-7 translate-x-1.5 place-items-center rounded-lg border border-white/10 bg-black/50 text-white/90 opacity-0 transition-all delay-75 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary hover:text-primary-foreground active:scale-95 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 motion-reduce:transition-none"
                >
                  <PlayIcon className="size-3.5 fill-current" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="left">{t("card.watch")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        )}

        {/* Where it stands in the viewer's own list — the status's icon and
            colour, and for a show being watched, how far along. The same
            marks the library page uses, so a card says it in the same
            words. */}
        {entry && (
          <LibraryMark
            status={entry.status}
            progress={entry.progress}
            episodes={anime.episodes}
            label={t(`status.${entry.status}`)}
          />
        )}

        {isAdult && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-black/60 px-1.5 py-px text-[10px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-400/40">
            18+
          </span>
        )}

        {/* Top-left: what the title is rated — and, while it has no rating
            yet, how long until it airs. */}
        {anime.score != null && (
          <ScoreBadge
            score={anime.score}
            className="absolute left-1.5 top-1.5 z-20 max-sm:px-1 max-sm:text-[11px] sm:left-2 sm:top-2"
          />
        )}
        {anime.score == null && countdown ? (
          <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/90">
            <ClockIcon className="size-3 text-muted-foreground/70" />
            {countdown}
          </span>
        ) : null}

        {/* "Coming soon" only — the "airing" tag added noise without telling the
            user anything they don't already get from the season/year line. */}
        {unreleased && !entry ? (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-opacity duration-200 group-hover:opacity-0">
            {t("card.soon")}
          </span>
        ) : null}

        {/* What used to be a popup beside the card now rises out of the
            poster's own lower edge: genres, what it's about, how it's rated.
            It takes no room on the page and covers nothing but the part of
            the picture that was already under a shadow. Clicks go through
            it to the poster link underneath. */}
        {canHover && hovered && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 translate-y-3 bg-gradient-to-t from-black/95 via-black/80 to-black/0 px-2.5 pb-2.5 pt-10 text-white opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-hover:opacity-100 starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none">
            {anime.genres.length > 0 && (
              <p className="truncate text-[10px] font-medium text-white/70">
                {anime.genres.slice(0, 3).map((g) => labels.genreLabel(g)).join(" · ")}
              </p>
            )}
            {anime.synopsis && (
              <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-white/85">
                {anime.synopsis}
              </p>
            )}
            {shortRating(anime.rating) && (
              <p className="mt-1 text-[10px] text-white/50">{shortRating(anime.rating)}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-xs font-medium leading-snug text-foreground/90 transition-colors duration-300 group-hover:text-foreground sm:text-[13px]">
          <Link to={animeHref(anime)} viewTransition className="outline-none">
            {title}
          </Link>
        </h3>
        {/* One line in plain words — "ТВ · 12 эп. · 2023" — where there used
            to be an icon in front of every fact: three icons per card, forty
            cards a page, was most of what made the grid look busy. A dot
            still marks a title that is airing. */}
        <p className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
          {airing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={labels.airingLabel(anime.airing)}
                  className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/80"
                />
              </TooltipTrigger>
              <TooltipContent side="top">{labels.airingLabel(anime.airing)}</TooltipContent>
            </Tooltip>
          )}
          {/* The year alone: "Весна 2021" didn't fit beside the rest at six
              cards a row, and the season is on the title's page. On a phone
              the episode count drops out too — three cards a row leave room
              for two facts, and a cut-off third read as a glitch. */}
          <span className="truncate tabular-nums">
            {labels.typeLabel(anime.type)}
            {anime.episodes != null && anime.episodes > 1 && (
              <span className="hidden sm:inline"> · {t("watch.episodesCount", { count: anime.episodes })}</span>
            )}
            {anime.year ? ` · ${anime.year}` : null}
          </span>
        </p>
      </div>
    </article>
  );

  return card;
}

/**
 * The viewer's own status for this title, bottom-left on the poster: the
 * status icon on its colour, and for anything in progress a bar along the
 * foot of the picture showing how far through they are.
 */
function LibraryMark({
  status,
  progress,
  episodes,
  label,
}: {
  status: keyof typeof STATUS_META;
  progress: number;
  episodes: number | null;
  label: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  const percent =
    episodes && episodes > 0 && progress > 0
      ? Math.min(100, Math.round((progress / episodes) * 100))
      : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className="absolute bottom-1.5 left-1.5 z-20 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium transition-opacity duration-200 group-hover:opacity-0 sm:bottom-2 sm:left-2 sm:text-[11px]"
          >
            <Icon className={cn("size-3.5", meta.text)} />
            {percent != null && status !== "COMPLETED" && (
              <span className="tabular-nums text-foreground/80">
                {progress}/{episodes}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
      {percent != null && status !== "COMPLETED" && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/40">
          <span className={cn("block h-full", meta.bar)} style={{ width: `${percent}%` }} />
        </span>
      )}
    </>
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
