import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  Loader2Icon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { musicSession, type MusicTrack } from "@/lib/music-session";
import { MusicEqualizer } from "./music-player";
import { useMusic } from "@/hooks/use-music";
import { PLAYER_CENTER_BUTTON } from "@/lib/player-appearance";
import { cn } from "@/lib/utils";

type TrackDto = Omit<MusicTrack, "animeId" | "animeTitle" | "animeHref" | "cover">;
export function AnimeOpenings({
  animeId,
  title,
  href,
  poster,
  onAvailable,
}: {
  animeId: number;
  title: string;
  href: string;
  poster: string | null;
  onAvailable?: (available: boolean) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["anime-music", animeId],
    queryFn: ({ signal }) =>
      apiRequest<{ items: TrackDto[] }>(`/anime/${animeId}/music`, { signal }),
    staleTime: (query) => (query.state.data?.items.length ? 30 * 60_000 : 60_000),
    retry: 1,
  });
  const music = useMusic();
  const current = music.queue[music.index];
  const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const tracks = (data?.items ?? [])
    .filter((track) => !music.failedIds.includes(track.id))
    .map((track) => ({
      ...track,
      url: apiBase + track.url,
      fallbackUrl: track.fallbackUrl ? apiBase + track.fallbackUrl : null,
      animeId,
      animeTitle: title,
      animeHref: href,
      cover: imageSrc(poster, 240) ?? null,
    }));
  const available = !isPending && !isError && tracks.length > 0;
  useEffect(() => {
    onAvailable?.(available);
  }, [available, onAvailable]);
  if (!available) return null;
  return (
    <section
      id="openings"
      aria-label="Опенинги аниме"
      className="opening-section w-full max-w-3xl scroll-mt-24 rounded-2xl border border-border/60 bg-card/70 p-3 sm:p-4"
    >
      <header className="mb-2 flex items-center justify-between gap-3 px-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Music2Icon className="size-4 text-primary" />
          Опенинги
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {tracks.length}
          </span>
        </h2>
        <a
          href="https://animethemes.moe"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          AnimeThemes
          <ExternalLinkIcon className="size-3" />
        </a>
      </header>
      <div className="flex flex-col gap-1">
        {tracks.map((track, index) => {
          const selected = current?.id === track.id;
          const playing =
            selected && (music.status === "playing" || music.status === "loading");
          return (
            <div
              key={track.id}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors",
                selected ? "bg-primary/[0.07]" : "hover:bg-secondary/50",
              )}
            >
              <button
                type="button"
                aria-label={`${playing ? "Пауза" : "Слушать"}: ${track.title}`}
                onClick={() => musicSession.play(tracks, index)}
                className={cn(
                  PLAYER_CENTER_BUTTON,
                  "size-9 shrink-0 hover:bg-primary/25",
                  selected ? "ring-primary/50 text-primary" : "text-white/90",
                )}
              >
                {selected && music.status === "loading" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : playing ? (
                  <PauseIcon className="size-4 fill-current" />
                ) : (
                  <PlayIcon className="size-4 translate-x-px fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => musicSession.play(tracks, index)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {track.artist || title}
                </span>
              </button>
              {selected && music.status === "playing" ? (
                <MusicEqualizer active className="h-6 w-12! shrink-0" />
              ) : (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {track.label}
                </span>
              )}
              {track.sourceUrl && (
                <a
                  href={track.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Открыть ${track.label} в AnimeThemes`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
