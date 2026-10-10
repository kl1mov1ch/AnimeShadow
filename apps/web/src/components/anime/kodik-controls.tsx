import {
  FastForwardIcon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/episodes";
import { useKodikBridge } from "@/lib/kodik-bridge";
import { cn } from "@/lib/utils";

interface Range {
  start: number;
  stop: number;
}

/**
 * The site's own controls for a Kodik player, beside its picture: play and
 * pause, ten seconds back and forward, "skip the opening" while it plays,
 * the next episode, sound, fullscreen, and a progress bar with the opening
 * and ending marked on it. Everything goes through Kodik's player API — the
 * player keeps its own interface and its adverts; these are a second,
 * nicer set of buttons, not a replacement that hides anything.
 *
 * Shown only once the player has spoken through the API: a player that
 * doesn't (an error page, a region block) gets no dead buttons.
 */
export function KodikControls({
  frame,
  opening,
  ending,
  hasNext,
  onNext,
  fullscreenTarget,
  compact = false,
  className,
}: {
  frame: HTMLIFrameElement | null;
  opening: Range | null;
  ending: Range | null;
  hasNext: boolean;
  onNext: () => void;
  /** What goes fullscreen: the player and these controls together. */
  fullscreenTarget?: HTMLElement | null;
  /** Fewer buttons, for the picture-in-picture window. */
  compact?: boolean;
  className?: string;
}) {
  const [alive, setAlive] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [advert, setAdvert] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // A new frame (another episode, another dub, moved to another window)
  // starts from nothing until it speaks.
  useEffect(() => {
    setAlive(false);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setAdvert(false);
  }, [frame]);

  const kodik = useKodikBridge(frame, {
    onAlive: () => setAlive(true),
    onTime: (t) => {
      setTime(t);
      setPlaying(true);
    },
    onDuration: setDuration,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onMuted: setMuted,
    onAdvert: setAdvert,
  });

  useEffect(() => {
    const doc = fullscreenTarget?.ownerDocument ?? document;
    const onChange = () => setFullscreen(doc.fullscreenElement != null);
    doc.addEventListener("fullscreenchange", onChange);
    return () => doc.removeEventListener("fullscreenchange", onChange);
  }, [fullscreenTarget]);

  const bar = useRef<HTMLDivElement>(null);
  if (!alive) return null;

  const inOpening = opening != null && time >= opening.start && time < opening.stop - 2;
  const pct = (seconds: number) => (duration > 0 ? Math.min(100, (seconds / duration) * 100) : 0);
  const locked = advert;

  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    if (locked || duration <= 0 || !bar.current) return;
    const rect = bar.current.getBoundingClientRect();
    kodik.seek(((event.clientX - rect.left) / rect.width) * duration);
  };

  const toggleFullscreen = () => {
    const doc = fullscreenTarget?.ownerDocument ?? document;
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
    else void fullscreenTarget?.requestFullscreen?.().catch(() => undefined);
  };

  const button = "grid size-8 shrink-0 place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/60 bg-card/80 px-2.5 py-2",
        className,
      )}
    >
      {/* Progress, with the opening and the ending marked. */}
      <div
        ref={bar}
        role="slider"
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onClick={seekTo}
        className={cn("group relative h-2 cursor-pointer rounded-full bg-foreground/10", locked && "cursor-default")}
      >
        {opening && duration > 0 && (
          <span
            title={`Опенинг ${formatClock(opening.start)}–${formatClock(opening.stop)}`}
            className="absolute inset-y-0 rounded-full bg-amber-400/35"
            style={{ left: `${pct(opening.start)}%`, width: `${pct(opening.stop) - pct(opening.start)}%` }}
          />
        )}
        {ending && duration > 0 && (
          <span
            title={`Эндинг ${formatClock(ending.start)}–${formatClock(ending.stop)}`}
            className="absolute inset-y-0 rounded-full bg-sky-400/35"
            style={{ left: `${pct(ending.start)}%`, width: `${pct(ending.stop) - pct(ending.start)}%` }}
          />
        )}
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(time)}%` }} />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-0 shadow transition-opacity group-hover:opacity-100"
          style={{ left: `${pct(time)}%` }}
        />
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={locked}
          onClick={() => (playing ? kodik.pause() : kodik.play())}
          aria-label={playing ? "Пауза" : "Смотреть"}
          title={playing ? "Пауза" : "Смотреть"}
          className={cn(button, "bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground")}
        >
          {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
        </button>
        <button type="button" disabled={locked} onClick={() => kodik.seek(time - 10)} aria-label="Назад на 10 секунд" title="−10 с" className={button}>
          <RotateCcwIcon className="size-4" />
        </button>
        <button type="button" disabled={locked} onClick={() => kodik.seek(time + 10)} aria-label="Вперёд на 10 секунд" title="+10 с" className={button}>
          <RotateCwIcon className="size-4" />
        </button>
        <span className="ml-1.5 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatClock(time)}
          {duration > 0 && <span className="text-muted-foreground/60"> / {formatClock(duration)}</span>}
        </span>
        {advert && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">реклама</span>}

        <span className="ml-auto flex items-center gap-0.5">
          {inOpening && !locked && (
            <button
              type="button"
              onClick={() => kodik.seek(opening!.stop)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-400/15 px-2.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-400/25 dark:text-amber-400"
            >
              <FastForwardIcon className="size-3.5" />
              {compact ? "OP" : "Пропустить опенинг"}
            </button>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              if (muted) kodik.unmute();
              else kodik.mute();
              setMuted(!muted);
            }}
            aria-label={muted ? "Включить звук" : "Выключить звук"}
            title={muted ? "Включить звук" : "Выключить звук"}
            className={button}
          >
            {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
          </button>
          {hasNext && (
            <button type="button" onClick={onNext} aria-label="Следующая серия" title="Следующая серия (Shift+N)" className={button}>
              <SkipForwardIcon className="size-4" />
            </button>
          )}
          {!compact && fullscreenTarget && (
            <button type="button" onClick={toggleFullscreen} aria-label="На весь экран" title="На весь экран" className={button}>
              {fullscreen ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
