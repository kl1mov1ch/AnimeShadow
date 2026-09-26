import type { AnimeSummary } from "@animeshadow/shared";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { AnimeListRow, AnimeListRowSkeleton } from "@/components/anime/anime-list-row";
import { cn } from "@/lib/utils";

// Column counts that all divide the catalogue's 24-per-page evenly (2, 3, 4
// and 6), so the last row is always full rather than trailing a few cards.
const GRID_CLASS =
  "grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-5 lg:grid-cols-6";
// The wide cards sit two abreast once there's room for two — 24 is even, so
// the pairs always come out square.
const LIST_CLASS = "grid gap-3 xl:grid-cols-2";

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
