import type { AnimeSummary } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime/anime-card";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useT } from "@/i18n";

interface AnimeRailProps {
  title: string;
  subtitle?: string;
  items: AnimeSummary[];
  href?: string;
  loading?: boolean;
}

/**
 * A row of anime, paged with buttons — no scrollbar. Shows a page of N cards;
 * the arrows step between pages.
 */
export function AnimeRail({
  title,
  subtitle,
  items,
  href,
  loading = false,
}: AnimeRailProps) {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState(0);

  const perPage = isDesktop ? 6 : 3;
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const clamped = Math.min(page, pageCount - 1);
  const start = clamped * perPage;
  const visible = items.slice(start, start + perPage);

  if (!loading && items.length === 0) return null;

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
          {pageCount > 1 && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("common.previous")}
                disabled={clamped === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("common.next")}
                disabled={clamped >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
        {loading
          ? Array.from({ length: perPage }, (_, i) => <AnimeCardSkeleton key={i} />)
          : visible.map((anime, i) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                priority={clamped === 0 && i < 4}
              />
            ))}
      </div>
    </section>
  );
}
