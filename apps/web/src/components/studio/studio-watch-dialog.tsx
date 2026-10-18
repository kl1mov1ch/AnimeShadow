import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon, Volume2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { animeHref } from "@/lib/format";
import type { StudioAnime } from "./studio-data";

const StudioPreview = lazy(() => import("./studio-preview"));

export function StudioWatchDialog({
  anime,
  onClose,
}: {
  anime: StudioAnime | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!anime} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hk-page hk-watch-dialog">
        <DialogHeader>
          <DialogTitle>{anime?.titleLocalized || anime?.title}</DialogTitle>
          <DialogDescription>
            Смотрите аниме в озвучке Hon-Kon Studio прямо здесь.
          </DialogDescription>
        </DialogHeader>
        {anime && (
          <>
            <div className="hk-preview-note">
              <Volume2Icon aria-hidden />
              <span>Hon-Kon Studio · плеер AnimeShadow</span>
            </div>
            <Suspense
              fallback={
                <div className="hk-video-loading" role="status">
                  Подготавливаем плеер…
                </div>
              }
            >
              <StudioPreview
                key={anime.id}
                animeId={anime.id}
                initialEpisode={anime.episodeNumbers[0] ?? 1}
              />
            </Suspense>
            <div className="hk-preview-footer">
              <span>Доступные серии в озвучке Hon-Kon Studio.</span>
              <Button size="sm" variant="outline" asChild>
                <Link to={`${animeHref(anime)}?studio=hon-kon#watch`}>
                  Страница аниме
                  <ArrowUpRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
