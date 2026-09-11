import type { AnimeSummary } from "@animeshadow/shared";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { cn } from "@/lib/utils";

const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

interface AnimeGridProps {
  items: AnimeSummary[];
  priorityCount?: number;
  className?: string;
}

export function AnimeGrid({ items, priorityCount = 0, className }: AnimeGridProps) {
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

export function AnimeGridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <AnimeCardSkeleton key={index} />
      ))}
    </div>
  );
}
