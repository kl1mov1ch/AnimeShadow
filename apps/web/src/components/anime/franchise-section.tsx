import type { FranchiseEntry } from "@animeshadow/shared";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
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
 * Every season, movie and spin-off sharing this title's continuity, as a
 * compact poster rail right on the page — so finding "season 2" doesn't
 * mean leaving to search for it. Same poster-card/hover-preview language as
 * the rest of the site (see AnimeCard) rather than a one-off look, and it
 * simply doesn't render for a standalone title with nothing else to list.
 */
export function FranchiseSection({ animeId }: { animeId: number }) {
  const t = useT();
  const { data, isPending } = useFranchise(animeId);

  if (isPending) {
    return (
      <section className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-20 shrink-0 rounded-lg sm:w-24" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length < 2) return null;

  return (
    <section className="flex flex-col gap-3 p-5">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("detail.sections.seasons")}
      </h2>
      <div className="rail-scroll -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {data.map((entry) => (
          <FranchiseCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function FranchiseCard({ entry }: { entry: FranchiseEntry }) {
  const t = useT();
  const labels = useLabels();
  const canHover = useMediaQuery("(hover: hover)");
  const metaLine = [labels.typeLabel(entry.kind), entry.year].filter(Boolean).join(" · ");

  const body = (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1.5 sm:w-24">
      <div
        className={cn(
          "aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted transition-[border-color,transform] duration-300",
          entry.current
            ? "border-primary ring-2 ring-primary/25"
            : "border-border/60 group-hover:-translate-y-0.5 group-hover:border-border motion-reduce:group-hover:translate-y-0",
        )}
      >
        {entry.imageUrl ? (
          <img
            src={imageSrc(entry.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <PosterFallback title={entry.title} seed={entry.id} />
        )}
      </div>
      <p
        className={cn(
          "line-clamp-2 w-full text-center text-[11px] font-medium leading-tight",
          entry.current ? "text-primary" : "text-foreground",
        )}
      >
        {entry.title}
      </p>
    </div>
  );

  // The title you're already reading isn't a link to itself — just marked,
  // ring and all, so its place in the lineup is still obvious at a glance.
  const card = entry.current ? (
    <div className="group flex flex-col items-center" title={t("detail.seasons.current")}>
      {body}
    </div>
  ) : (
    <Link
      to={`/anime/${entry.id}`}
      className="group flex flex-col items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );

  // Touch devices have no hover to preview on — skip the extra portal entirely.
  if (!canHover) return card;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={10} className="w-60">
        <div className="flex gap-3">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
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
            <p className="line-clamp-2 text-sm font-medium leading-snug">{entry.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{metaLine}</p>
            {entry.current && (
              <p className="mt-1.5 text-xs font-medium text-primary">
                {t("detail.seasons.current")}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
