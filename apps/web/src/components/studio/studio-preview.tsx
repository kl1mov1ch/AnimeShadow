import { isHonKonSource } from "@animeshadow/shared";
import { useState } from "react";
import { WatchSection } from "@/components/anime/watch-section";
import { Button } from "@/components/ui/button";
import { useAnime } from "@/lib/query";

export default function StudioPreview({
  animeId,
  initialEpisode,
}: {
  animeId: number;
  initialEpisode: number;
}) {
  const anime = useAnime(animeId);
  const [episode, setEpisode] = useState(initialEpisode);
  if (anime.isError)
    return (
      <div className="hk-load-state" role="alert">
        <p>Не удалось открыть аниме.</p>
        <Button variant="outline" onClick={() => void anime.refetch()}>
          Повторить
        </Button>
      </div>
    );
  if (!anime.data)
    return (
      <div className="hk-video-loading" role="status">
        Подготавливаем видео…
      </div>
    );
  return (
    <WatchSection
      anime={anime.data}
      title={anime.data.titleLocalized || anime.data.title}
      active
      episode={episode}
      onEpisodeChange={setEpisode}
      sourceFilter={isHonKonSource}
      studio="hon-kon"
      directOnly
    />
  );
}
