import type { FranchiseEntry } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
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
 * Links to this title's other seasons and films. Only titles this site can
 * actually play show up (the API filtered out anything with no working
 * player or no artwork), so every link is one the viewer can act on.
 *
 * It is one horizontal rail at every width — the same shelf the homepage
 * uses. It used to switch to a vertical stack from lg up, which was right
 * while it lived in a narrow column beside the facts list; now that it is a
 * section of its own, that stack stretched every row across the full page
 * and the hover card aimed itself off the right edge of the screen.
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
  const all = data ?? [];
  if (!all.some((entry) => !entry.current)) return null;
  // In the order they came out, the open title among them — so it reads as
  // a story: where this one sits, what came before and after.
  const ordered = [...all].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id - b.id);

  // Reads both axes and combines them — whichever axis isn't actually
  // scrollable at the current breakpoint sits permanently at its own start
  // *and* end (scrollTop 0 with nothing to scroll satisfies both), so ANDing
  // never lets an inert axis mask the one that matters.
  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "часть" : ordered.length < 5 ? "части" : "частей"} по порядку выхода
        </span>
        {ordered.length > 3 && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={t("common.previous")}
              disabled={atStart}
              onClick={() => nudge(-1)}
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
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
        className="flex snap-x gap-2.5 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ordered.map((entry, i) => (
          <FranchiseLink key={entry.id} entry={entry} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

function FranchiseLink({ entry, index }: { entry: FranchiseEntry; index: number }) {
  const t = useT();
  const labels = useLabels();
  const canHover = useMediaQuery("(hover: hover)");
  const metaLine = [labels.typeLabel(entry.kind), entry.year].filter(Boolean).join(" · ");

  // One compact width at every breakpoint. The rail is a section of its own
  // now, so a card that grows with the viewport just becomes a very wide row
  // holding a thumbnail and two short lines.
  const body = (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border p-2.5 transition-colors duration-200",
        entry.current ? "border-primary/60 bg-primary/10" : "border-border/60 bg-card/50 group-hover:border-foreground/25 group-hover:bg-card",
      )}
    >
      <span className="absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full bg-black/70 text-[10px] font-bold tabular-nums text-white">
        {index}
      </span>
      <div className="h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {entry.imageUrl ? (
          <img src={imageSrc(entry.imageUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <PosterFallback title={entry.title} seed={entry.id} variant="avatar" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base leading-none tabular-nums">{entry.year ?? "—"}</p>
        <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{entry.title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.current ? "Вы здесь" : labels.typeLabel(entry.kind)}</p>
      </div>
    </div>
  );
  const card = entry.current ? (
    <div aria-current="page" className="w-60 shrink-0 snap-start">
      {body}
    </div>
  ) : (
    <Link to={`/anime/${entry.id}`} className="group w-60 shrink-0 snap-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  );

  // Touch devices have no hover to preview on — the row itself already
  // shows title + type + year, so there's nothing more to add there anyway.
  if (!canHover || entry.current) return card;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      {/* Above the row. Aiming it right made sense while the list was a
          column at the left edge; in a full-width rail the cards near the
          right of the screen had nowhere to put it. The title is never
          clamped here, unlike in the row: this is the place with room. */}
      <HoverCardContent side="top" align="start" sideOffset={10} className="w-80">
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
