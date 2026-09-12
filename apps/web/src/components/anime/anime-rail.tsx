import type { AnimeSummary } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface AnimeRailProps {
  title: string;
  subtitle?: string;
  items: AnimeSummary[];
  href?: string;
  loading?: boolean;
}

const SKELETON_COUNT = 6;
const RAIL_ANIM_MS = 200;
const MAX_PAGER_BUTTONS = 9;

/** Matches the card-width breakpoints below — how many cards a "page" is. */
function useItemsPerPage(): number {
  const lg = useMediaQuery("(min-width: 1024px)");
  const sm = useMediaQuery("(min-width: 640px)");
  if (lg) return 6;
  if (sm) return 4;
  return 2;
}

/**
 * A horizontally scrolling row — native smooth scroll-snap, not a page swap.
 * The arrows nudge by one viewport's worth; touch/trackpad scrolling works
 * the same way a native app carousel does. A small vertical page-number
 * stack alongside it (desktop only) jumps straight to a page, with the
 * visible strip flying out and the new page flying in from the direction
 * you're jumping — one animated element regardless of card count, so it
 * never gets choppy no matter how long the rail is.
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
  const perPage = useItemsPerPage();
  const [page, setPage] = useState(0);
  const [anim, setAnim] = useState<
    "out-up" | "out-down" | "in-up" | "in-down" | null
  >(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (jumpTimer.current) clearTimeout(jumpTimer.current);
    },
    [],
  );

  if (!loading && items.length === 0) return null;

  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const pagerCount = Math.min(pageCount, MAX_PAGER_BUTTONS);
  const showPager = !loading && pageCount > 1;

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    if (!jumpTimer.current) {
      const width = el.clientWidth || 1;
      setPage(Math.round(el.scrollLeft / width));
    }
  };

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // One "page" ≈ the visible width, so a click feels like turning a page
    // while the motion itself stays a smooth scroll, not a hard cut.
    el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: "smooth" });
  };

  const goToPage = (target: number) => {
    if (target === page || jumpTimer.current) return;
    const forward = target > page;
    setAnim(forward ? "out-up" : "out-down");
    jumpTimer.current = setTimeout(() => {
      const el = trackRef.current;
      if (el) el.scrollLeft = target * el.clientWidth;
      setPage(target);
      setAnim(forward ? "in-up" : "in-down");
      jumpTimer.current = setTimeout(() => {
        setAnim(null);
        jumpTimer.current = null;
      }, RAIL_ANIM_MS);
    }, RAIL_ANIM_MS);
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
              <Link to={href}>{t("common.browseCatalogue")}</Link>
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

      <div className="flex items-stretch gap-2">
        <div
          ref={trackRef}
          onScroll={updateEdges}
          className={cn(
            "-mx-4 flex min-w-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            anim === "out-up" && "rail-page-out-up",
            anim === "out-down" && "rail-page-out-down",
            anim === "in-up" && "rail-page-in-up",
            anim === "in-down" && "rail-page-in-down",
          )}
        >
          {loading
            ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <AnimeCardSkeleton
                  key={i}
                  className="w-[calc((100%-4*1rem)/5)] shrink-0 snap-start sm:w-[calc((100%-3*1rem)/4)] lg:w-[calc((100%-5*1rem)/6)]"
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

        {showPager && (
          <div className="hidden w-7 shrink-0 flex-col items-center justify-between py-1 sm:flex">
            {Array.from({ length: pagerCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === page}
                onClick={() => goToPage(i)}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums transition-colors",
                  i === page
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
