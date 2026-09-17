import type { AnimeSummary } from "@animeshadow/shared";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { AnimeListRow, AnimeListRowSkeleton } from "@/components/anime/anime-list-row";
import { cn } from "@/lib/utils";

// Column counts that all divide the catalogue's 20-per-page evenly (20 = 2x10
// = 4x5 = 5x4), so the last row is always full instead of trailing two lonely
// cards. The old ladder included 3 and 6, neither of which divides 20 — which
// is exactly where the stranded last row came from.
const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-5";
const LIST_CLASS = "flex flex-col gap-2.5";

export type AnimeViewMode = "grid" | "list";

interface AnimeGridProps {
  items: AnimeSummary[];
  priorityCount?: number;
  className?: string;
  /** "grid" (default) — the usual poster wall — or "list": stretched, palette-tinted rows. */
  view?: AnimeViewMode;
}

export function AnimeGrid({
  items,
  priorityCount = 0,
  className,
  view = "grid",
}: AnimeGridProps) {
  if (view === "list") {
    return (
      <div className={cn(LIST_CLASS, className)}>
        {items.map((anime, index) => (
          <AnimeListRow key={anime.id} anime={anime} priority={index < priorityCount} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn(GRID_CLASS, className)}>
      {items.map((anime, index) => (
        <AnimeCard
          key={anime.id}
          anime={anime}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}

export function AnimeGridSkeleton({
  count = 18,
  view = "grid",
}: {
  count?: number;
  view?: AnimeViewMode;
}) {
  if (view === "list") {
    return (
      <div className={LIST_CLASS} aria-hidden>
        {Array.from({ length: Math.min(count, 8) }, (_, index) => (
          <AnimeListRowSkeleton key={index} />
        ))}
      </div>
    );
  }
  return (
    <div className={GRID_CLASS} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <AnimeCardSkeleton key={index} />
      ))}
    </div>
  );
}
