import type { AnimeOpening } from "@animeshadow/shared";
import { ExternalLinkIcon, MusicIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useAnimeThemes } from "@/lib/query";
import { cn } from "@/lib/utils";

type Slot = "opening" | "ending";

/**
 * The title's opening and ending, as something you can listen to.
 *
 * Streamed from AnimeThemes, which is what its API is for. There is
 * deliberately no download button: these are commercial recordings, and
 * handing over the file is a different act from letting someone hear the
 * theme on the page they are already reading. The link out goes to the
 * archive's own page for the title, where what to offer beyond listening is
 * its decision rather than ours to route around.
 */
export function ThemePlayer({ animeId }: { animeId: number }) {
  const t = useT();
  const { data } = useAnimeThemes(animeId);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [active, setActive] = useState<Slot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const slots: Array<{ slot: Slot; theme: AnimeOpening | null; label: string }> = [
    { slot: "opening", theme: data?.opening ?? null, label: t("detail.soundtrack.opening") },
    { slot: "ending", theme: data?.ending ?? null, label: t("detail.soundtrack.ending") },
  ];
  // Only the ones with an actual audio track — the video exists far more
  // often than the separate .ogg does, and a button that cannot play is
  // worse than no button.
  const playable = slots.filter((s) => s.theme?.audioUrl);

  // A new title must not keep the previous one's track playing underneath it.
  useEffect(() => {
    setActive(null);
    setPlaying(false);
    setProgress(0);
  }, [animeId]);

  if (playable.length === 0) return null;

  const current = playable.find((s) => s.slot === active)?.theme ?? null;

  const toggle = (slot: Slot) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (active === slot) {
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
      return;
    }
    setActive(slot);
    setProgress(0);
    // The <audio> src changes on the next render, so play() waits for it.
    queueMicrotask(() => void audioRef.current?.play().catch(() => undefined));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <div className="flex items-center gap-2">
        <MusicIcon className="size-4 text-[var(--accent-ink)]" />
        <span className="text-xs font-medium text-muted-foreground/70">
          {t("detail.soundtrack.title")}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {playable.map(({ slot, theme, label }) => {
          const isActive = active === slot;
          const isPlaying = isActive && playing;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => toggle(slot)}
              aria-pressed={isActive}
              className={cn(
                "group relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all duration-300",
                isActive
                  ? "border-[var(--accent-line)] bg-[var(--accent-surface-strong)]"
                  : "border-border/60 bg-card/40 hover:-translate-y-0.5 hover:border-[var(--accent-line)]",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  isActive
                    ? "bg-[var(--accent-ink)] text-background"
                    : "bg-secondary/60 text-foreground/70 group-hover:text-[var(--accent-ink)]",
                )}
              >
                {isPlaying ? (
                  <PauseIcon className="size-4 fill-current" />
                ) : (
                  <PlayIcon className="size-4 translate-x-[1px] fill-current" />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {label}
                  {/* Four bars keeping time — the one thing on the card that
                      says "this is the one playing" without reading. */}
                  {isPlaying && (
                    <span aria-hidden className="flex h-3 items-end gap-[2px]">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="equaliser-bar w-[2px] rounded-full bg-[var(--accent-ink)]"
                          style={{ animationDelay: `${i * 140}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </span>
                <span className="truncate text-sm font-medium">
                  {theme?.song ?? label}
                </span>
                {theme?.artist && (
                  <span className="truncate text-xs text-muted-foreground">
                    {theme.artist}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* One bar for whichever is playing, rather than one per button that
          sits empty most of the time. */}
      {current && (
        <div className="flex items-center gap-3">
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/70">
            <span
              className="block h-full rounded-full bg-[var(--accent-ink)] transition-[width] duration-300 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </span>
          {current.pageUrl && (
            <a
              href={current.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-[var(--accent-ink)]"
            >
              {t("detail.soundtrack.source")}
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      )}

      <audio
        ref={audioRef}
        src={current?.audioUrl ?? undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(event) => {
          const el = event.currentTarget;
          if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
        }}
      />
    </div>
  );
}
