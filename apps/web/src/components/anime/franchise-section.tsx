import type { FranchiseEntry } from "@animeshadow/shared";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFranchise } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * A quiet list of links to this title's other seasons/movies — folded into
 * the overview rather than a section of its own. Only titles this site can
 * actually play show up here (the API already filtered out anything with no
 * working player or no artwork), so every link is one the viewer can act on.
 *
 * Below the desktop breakpoint there's no room to spare next to the facts
 * list, so it's the homepage's own horizontally-swipeable rail (arrow-nudge,
 * no visible scrollbar, ~3 per view). From lg up, alongside the facts list,
 * it switches to a vertical stack in a narrow left column — same arrow-nudge
 * idea, just scrolling up/down inside a capped height instead of sideways.
 */
export function FranchiseRail({ animeId, className }: { animeId: number; className?: string }) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const { data } = useFranchise(animeId);
  // The title already open has no business in its own "other seasons" list —
  // it's not a link anywhere else on the page either, so listing it here too
  // (even shown-but-inert) just reads as clutter and risks a stray click.
  const others = (data ?? []).filter((entry) => !entry.current);

  if (others.length === 0) return null;

  // Reads both axes and combines them — whichever axis isn't actually
  // scrollable at the current breakpoint sits permanently at its own start
  // *and* end (scrollTop 0 with nothing to scroll satisfies both), so ANDing
  // never lets an inert axis mask the one that matters.
  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4 && el.scrollTop <= 4);
    setAtEnd(
      el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 &&
        el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
    );
  };

  const nudge = (dir: 1 | -1, axis: "x" | "y") => {
    const el = trackRef.current;
    if (!el) return;
    if (axis === "x") el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
    else el.scrollBy({ top: dir * el.clientHeight * 0.92, behavior: "smooth" });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground/70">
          {t("detail.sections.seasons")}
        </span>
        {others.length > 3 && (
          <div className="flex shrink-0 gap-1">
            {/* Horizontal pager — the rail below lg. */}
            <Button
              variant="outline"
              size="icon"
              className="size-6 lg:hidden"
              aria-label={t("common.previous")}
              disabled={atStart}
              onClick={() => nudge(-1, "x")}
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-6 lg:hidden"
              aria-label={t("common.next")}
              disabled={atEnd}
              onClick={() => nudge(1, "x")}
            >
              <ChevronRightIcon className="size-3.5" />
            </Button>
            {/* Vertical pager — the desktop column, hidden below lg. */}
            <Button
              variant="outline"
              size="icon"
              className="hidden size-6 lg:inline-flex"
              aria-label={t("common.previous")}
              disabled={atStart}
              onClick={() => nudge(-1, "y")}
            >
              <ChevronUpIcon className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden size-6 lg:inline-flex"
              aria-label={t("common.next")}
              disabled={atEnd}
              onClick={() => nudge(1, "y")}
            >
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-h-56 lg:snap-y lg:flex-col lg:overflow-y-auto"
      >
        {others.map((entry) => (
          <FranchiseLink key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function FranchiseLink({ entry }: { entry: FranchiseEntry }) {
  const t = useT();
  const labels = useLabels();
  const canHover = useMediaQuery("(hover: hover)");
  const metaLine = [labels.typeLabel(entry.kind), entry.year].filter(Boolean).join(" · ");

  // A slight peek of the next entry on a phone (88% rather than the full
  // width) hints there's more to swipe to; from sm up there's room for a
  // clean three-per-view — and from lg, the list itself has gone vertical
  // (see FranchiseRail), so each row is simply the full width of that
  // narrow column, height replacing width as the thing that varies.
  const card = (
    <Link
      to={`/anime/${entry.id}`}
      className="group w-[88%] shrink-0 snap-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[calc((100%-2*0.625rem)/3)] lg:w-full"
    >
      <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 p-2 transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.06]">
        <div className="h-10 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
          {entry.imageUrl ? (
            <img
              src={imageSrc(entry.imageUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <PosterFallback title={entry.title} seed={entry.id} variant="avatar" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug text-foreground">
            {entry.title}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{metaLine}</p>
        </div>
      </div>
    </Link>
  );

  // Touch devices have no hover to preview on — the row itself already
  // shows title + type + year, so there's nothing more to add there anyway.
  if (!canHover) return card;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      {/* Right of the row, not above it — the list itself sits at the left
          edge of the page on desktop, so there's open space to its right for
          a bigger card to land in without covering neighboring rows. The
          title is never clamped here (unlike the row itself): the tooltip
          is exactly the place with room to show it in full. */}
      <HoverCardContent side="right" align="start" sideOffset={14} className="w-80">
        <div className="flex gap-3">
          <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
            {entry.imageUrl ? (
              <img
                src={imageSrc(entry.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <PosterFallback title={entry.title} seed={entry.id} variant="avatar" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm leading-snug text-foreground">{entry.title}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{metaLine}</p>
            <p className="mt-2 text-xs text-primary">{t("detail.seasons.openHint")}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
