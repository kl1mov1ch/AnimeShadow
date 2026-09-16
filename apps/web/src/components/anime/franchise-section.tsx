import type { FranchiseEntry } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFranchise } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * A quiet strip of links to this title's other seasons/movies — folded into
 * the overview rather than a section of its own, since it's supplementary
 * detail, not a whole gallery. Only titles this site can actually play show
 * up here (the API already filtered out anything with no working player or
 * no artwork), so every link is one the viewer can act on. Same rail
 * mechanics as the homepage (arrow-nudge, no visible scrollbar) — three
 * links per view on a wide screen, one full-width link per swipe on a phone.
 */
export function FranchiseRail({ animeId }: { animeId: number }) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const { data, isPending } = useFranchise(animeId);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
        <Skeleton className="h-3.5 w-32" />
        <div className="flex gap-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="hidden h-14 w-full rounded-lg sm:block" />
          <Skeleton className="hidden h-14 w-full rounded-lg sm:block" />
        </div>
      </div>
    );
  }

  if (!data || data.length < 2) return null;

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground/70">
          {t("detail.sections.seasons")}
        </span>
        {data.length > 3 && (
          <div className="hidden shrink-0 gap-1 sm:flex">
            <Button
              variant="outline"
              size="icon"
              className="size-6"
              aria-label={t("common.previous")}
              disabled={atStart}
              onClick={() => nudge(-1)}
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-6"
              aria-label={t("common.next")}
              disabled={atEnd}
              onClick={() => nudge(1)}
            >
              <ChevronRightIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {data.map((entry) => (
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

  const row = (
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
        <p
          className={cn(
            "truncate text-sm font-medium leading-snug",
            entry.current ? "text-primary" : "text-foreground",
          )}
        >
          {entry.title}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{metaLine}</p>
      </div>
    </div>
  );

  // The title you're already on isn't a link to itself — shown plain, no
  // hover affordance, just marking its place in the lineup.
  // A slight peek of the next entry on a phone (88% rather than the full
  // width) hints there's more to swipe to; from sm up there's room for a
  // clean three-per-view instead.
  const itemClass = "w-[88%] shrink-0 snap-start sm:w-[calc((100%-2*0.625rem)/3)]";

  const card = entry.current ? (
    <div className={itemClass} title={t("detail.seasons.current")}>
      {row}
    </div>
  ) : (
    <Link
      to={`/anime/${entry.id}`}
      className={cn("group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", itemClass)}
    >
      {row}
    </Link>
  );

  // Touch devices have no hover to preview on — the row itself already
  // shows title + type + year, so there's nothing more to add there anyway.
  if (!canHover) return card;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={10} className="w-64">
        <div className="flex gap-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
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
            <p className="line-clamp-2 font-display text-sm leading-snug">{entry.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metaLine}</p>
            {entry.current ? (
              <p className="mt-1.5 text-xs font-medium text-primary">
                {t("detail.seasons.current")}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground/70">
                {t("detail.seasons.openHint")}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
