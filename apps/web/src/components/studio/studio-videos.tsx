import { lazy, Suspense, useState } from "react";
import { PlayIcon, YoutubeIcon } from "lucide-react";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { imageSrc } from "@/lib/format";
import type { StudioVideo } from "./studio-data";
import { StudioVideoPoster } from "./studio-video-poster";
const VideoPlayer = lazy(() =>
  import("@/components/anime/watch-section").then(({ CustomHlsPlayer }) => ({
    default: CustomHlsPlayer,
  })),
);

export function StudioVideos({
  videos,
  heading = "Трейлеры и видео",
}: {
  videos: StudioVideo[];
  heading?: string;
}) {
  const [selected, setSelected] = useState<StudioVideo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [episode, setEpisode] = useState(1);
  if (!videos.length) return null;
  return (
    <section className="hk-catalog" aria-label={`${heading} в озвучке Hon-Kon`}>
      <div className="hk-section-heading">
        <div>
          <h2 className="hk-branded-heading">
            <HonkonGlyph />
            {heading}
          </h2>
          <p className="hk-section-lead">Истории с голосами Hon-Kon Studio.</p>
        </div>
      </div>
      <div className="hk-video-grid">
        {videos.map((video) => (
          <button
            type="button"
            key={video.id}
            className="hk-video-card"
            onClick={() => {
              setSelected(video);
              setFailed(false);
              setAttempt(0);
              setEpisode(video.episodes?.[0] ?? 1);
            }}
          >
            <span className="hk-video-art">
              <StudioVideoPoster video={video} />
              {video.youtubeId && (
                <span className="hk-video-provider">
                  <YoutubeIcon aria-hidden /> YouTube
                </span>
              )}
              <PlayIcon className="hk-video-play" />
            </span>
            <span className="hk-video-copy">
              <strong>{video.title}</strong>
              <span>Озвучка Hon-Kon Studio</span>
            </span>
          </button>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="hk-page hk-watch-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.episodes ? "Сериал" : "Ролик"} в озвучке Hon-Kon Studio
            </DialogDescription>
          </DialogHeader>
          {selected?.episodes && (
            <label className="flex items-center gap-3 text-sm">
              Серия
              <select
                className="rounded-lg border border-border bg-background px-3 py-2"
                value={episode}
                onChange={(event) => {
                  setEpisode(Number(event.target.value));
                  setFailed(false);
                }}
              >
                {selected.episodes.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected &&
            (failed ? (
              <div className="hk-load-state" role="alert">
                <p>Ролик пока не отвечает.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Повторить
                </Button>
              </div>
            ) : selected.youtubeId ? (
              <div className="hk-youtube-frame">
                <iframe
                  key={selected.id}
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.youtubeId)}?playsinline=1&rel=0`}
                  title={selected.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <Suspense
                fallback={<div className="hk-video-loading">Подготавливаем ролик…</div>}
              >
                <div className="relative aspect-video min-w-0 overflow-hidden rounded-xl bg-black">
                  <VideoPlayer
                    key={`${selected.id}:${episode}:${attempt}`}
                    src={
                      selected.episodes
                        ? `${selected.stream}${episode}/master.m3u8`
                        : (selected.stream ?? "")
                    }
                    mediaTitle={selected.title}
                    skin="shadow"
                    isWinner
                    onReady={() => undefined}
                    onFailed={() => setFailed(true)}
                    poster={imageSrc(selected.image)}
                  />
                </div>
              </Suspense>
            ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}
