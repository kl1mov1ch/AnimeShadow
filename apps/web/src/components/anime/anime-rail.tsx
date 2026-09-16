import type { AnimeSummary } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

interface AnimeRailProps {
  title: string;
  subtitle?: ReactNode;
  items: AnimeSummary[];
  href?: string;
  loading?: boolean;
}

const SKELETON_COUNT = 6;

/**
 * A horizontally scrolling row — native smooth scroll-snap, not a page swap.
 * The arrows nudge by one viewport's worth; touch/trackpad scrolling works
 * the same way a native app carousel does.
 */
export function AnimeRail({
  title,
  subtitle,
  items,
  href,
  loading = false,
}: AnimeRailProps) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  if (!loading && items.length === 0) return null;

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // One "page" ≈ the visible width, so a click feels like turning a page
    // while the motion itself stays a smooth scroll, not a hard cut.
    el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {href && (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to={href}>{t("common.seeAll")}</Link>
            </Button>
          )}
          {items.length > 3 && (
            <div className="hidden gap-1 sm:flex">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("common.previous")}
                disabled={atStart}
                onClick={() => nudge(-1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("common.next")}
                disabled={atEnd}
                onClick={() => nudge(1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <AnimeCardSkeleton
                key={i}
                className="w-[calc((100%-4*1rem)/2.4)] shrink-0 snap-start sm:w-[calc((100%-3*1rem)/4)] lg:w-[calc((100%-5*1rem)/6)]"
              />
            ))
          : items.map((anime, i) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                priority={i < 6}
                className="w-[calc((100%-4*1rem)/2.4)] shrink-0 snap-start sm:w-[calc((100%-3*1rem)/4)] lg:w-[calc((100%-5*1rem)/6)]"
              />
            ))}
      </div>
    </section>
  );
}
