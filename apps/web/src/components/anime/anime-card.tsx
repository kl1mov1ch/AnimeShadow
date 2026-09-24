import type { AnimeSummary } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  CalendarIcon,
  ClockIcon,
  ListVideoIcon,
  PlayIcon,
  TvIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
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
        <AnimePoster anime={anime} title={title} small={slow} priority={priority} />

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

        {/* Two actions on the poster, stacked: keep it for later, and go
            straight to the player. They slide in one after the other under
            a hover; on a touch screen, with no hover to wait for, the
            bookmark stays put and the whole poster is the play action. */}
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
                  "grid size-9 place-items-center rounded-lg border border-white/15 backdrop-blur transition-all duration-300 hover:scale-110 active:scale-90 motion-reduce:transition-none",
                  inLibrary ? "bg-primary/90 text-primary-foreground" : "bg-black/60 text-white",
                  canHover && !inLibrary
                    ? "translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
                    : "opacity-100",
                )}
              >
                <MorphIcon
                  on={inLibrary}
                  off={BookmarkPlusIcon}
                  onIcon={BookmarkCheckIcon}
                  className="size-4"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {inLibrary ? t("card.inList") : t("card.addToList")}
            </TooltipContent>
          </Tooltip>
          {canHover && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`${animeHref(anime)}#watch`}
                  viewTransition
                  aria-label={t("card.watch")}
                  className="grid size-9 translate-x-2 place-items-center rounded-lg border border-white/15 bg-black/60 text-white opacity-0 backdrop-blur transition-all delay-75 duration-300 hover:scale-110 hover:bg-primary hover:text-primary-foreground active:scale-90 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 motion-reduce:transition-none"
                >
                  <PlayIcon className="size-4 fill-current" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="left">{t("card.watch")}</TooltipContent>
            </Tooltip>
          )}
        </div>

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
        {unreleased && !entry ? (
          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur transition-opacity duration-200 group-hover:opacity-0">
            {t("card.soon")}
          </span>
        ) : null}

        {/* What used to be a popup beside the card now rises out of the
            poster's own lower edge: genres, what it's about, how it's rated.
            It takes no room on the page and covers nothing but the part of
            the picture that was already under a shadow. Clicks go through
            it to the poster link underneath. */}
        {canHover && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 translate-y-full bg-gradient-to-t from-black via-black/90 to-black/0 px-2.5 pb-2.5 pt-8 text-white opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
            {anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {anime.genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="rounded border border-primary/50 bg-primary/25 px-1.5 py-px text-[10px] font-medium text-white"
                  >
                    {labels.genreLabel(g)}
                  </span>
                ))}
              </div>
            )}
            {anime.synopsis && (
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/85">
                {anime.synopsis}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-white/65">
              {shortRating(anime.rating) && <span>{shortRating(anime.rating)}</span>}
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
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          <Link to={animeHref(anime)} viewTransition className="outline-none">
            {title}
          </Link>
        </h3>
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
          {/* A permanent "AIRING" tag here used to say the same thing on
              every card of every currently-airing title, all the time, and
              told you nothing about *when* the next episode actually lands.
              That answer now lives in the hover preview instead — a plain
              dot still marks an airing title at a glance, without a label
              claiming a fact the card can't actually back up with a date. */}
          <span className="flex min-w-0 items-center gap-2.5 truncate">
            <span className="inline-flex items-center gap-1">
              <TvIcon className="size-3 shrink-0 text-muted-foreground/70" />
              {labels.typeLabel(anime.type)}
            </span>
            {anime.episodes != null && anime.episodes > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ListVideoIcon className="size-3 shrink-0 text-muted-foreground/70" />
                {anime.episodes}
              </span>
            )}
            {airing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-label={labels.airingLabel(anime.airing)}
                    className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{labels.airingLabel(anime.airing)}</TooltipContent>
              </Tooltip>
            )}
          </span>
          {when && (
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              <CalendarIcon className="size-3 text-muted-foreground/70" />
              {when}
            </span>
          )}
        </div>
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
            className="absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur transition-opacity duration-200 group-hover:opacity-0"
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
