import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Loader2Icon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { musicSession, musicTime } from "@/lib/music-session";
import { useMusic } from "@/hooks/use-music";
import { Slider } from "@/components/ui/slider";
import {
  PLAYER_CONTROL_BUTTON,
  PLAYER_CONTROL_TONE,
  PLAYER_SLIDER,
} from "@/lib/player-appearance";
import { cn } from "@/lib/utils";
const control = cn(PLAYER_CONTROL_BUTTON, PLAYER_CONTROL_TONE);

/** Log-spaced frequency bars read the actual audio, with no simulated bouncing. */
export function MusicEqualizer({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const samples = new Uint8Array(512);
    const draw = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (
        el.width !== Math.round(width * ratio) ||
        el.height !== Math.round(height * ratio)
      ) {
        el.width = Math.round(width * ratio);
        el.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const analyser = active && !reduced ? musicSession.getAnalyser() : null;
      if (analyser) analyser.getByteFrequencyData(samples);
      else samples.fill(0);
      ctx.fillStyle = getComputedStyle(el).color;
      const count = Math.min(40, Math.max(10, Math.floor(width / 5)));
      const gap = 2,
        barWidth = Math.max(1, (width - gap * (count - 1)) / count);
      for (let i = 0; i < count; i++) {
        const frequency = 70 * Math.pow(14000 / 70, i / Math.max(1, count - 1));
        const bin = analyser
          ? Math.min(
              samples.length - 1,
              Math.round(frequency / (analyser.context.sampleRate / analyser.fftSize)),
            )
          : 0;
        const level = Math.pow((samples[bin] ?? 0) / 255, 1.2);
        const barHeight = Math.min(height, 3 + level * (height - 3));
        ctx.globalAlpha = analyser ? 0.5 + level * 0.5 : 0.25;
        ctx.beginPath();
        ctx.roundRect(
          i * (barWidth + gap),
          (height - barHeight) / 2,
          barWidth,
          barHeight,
          Math.min(2, barWidth / 2),
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (active && !reduced && document.visibilityState === "visible")
        frame = requestAnimationFrame(draw);
    };
    draw();
    const onVisible = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    document.addEventListener("visibilitychange", onVisible);
    const resize = new ResizeObserver(onVisible);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={cn("h-6 w-12 text-primary", className)}
    />
  );
}

export function MusicPlayer() {
  const state = useMusic();
  const track = state.queue[state.index];
  const hasTrack = Boolean(track);
  const playing = state.status === "playing" || state.status === "loading";
  useEffect(() => {
    document.documentElement.classList.toggle("has-music-player", hasTrack);
    return () => document.documentElement.classList.remove("has-music-player");
  }, [hasTrack]);
  useEffect(() => {
    const videoStarted = (event: Event) => {
      if (event.target instanceof HTMLVideoElement && !event.target.muted)
        musicSession.pause();
    };
    const musicStarted = () =>
      document
        .querySelectorAll<HTMLVideoElement>("video[data-watch-video]")
        .forEach((video) => video.pause());
    document.addEventListener("play", videoStarted, true);
    window.addEventListener("as:music-start", musicStarted);
    return () => {
      document.removeEventListener("play", videoStarted, true);
      window.removeEventListener("as:music-start", musicStarted);
    };
  }, []);
  if (!track) return null;
  return (
    <aside
      aria-label="Музыкальный плеер"
      className="music-dock fixed inset-x-3 bottom-[calc(var(--mobile-nav-space)+0.75rem)] z-40 mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-black/85 text-white shadow-[0_12px_60px_#0008] backdrop-blur-xl sm:inset-x-6 md:bottom-5"
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 sm:gap-3 sm:px-4">
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <Music2Icon className="size-8 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <Link
            to={track.animeHref}
            className="block truncate text-xs text-white/55 hover:text-primary"
          >
            {state.status === "error"
              ? "Не удалось загрузить. Нажми Play ещё раз."
              : track.artist || track.animeTitle}
          </Link>
        </div>
        <MusicEqualizer
          active={state.status === "playing"}
          className="h-6 w-8! shrink-0 sm:w-14!"
        />
        <button
          aria-label="Предыдущий опенинг"
          onClick={musicSession.previous}
          className={cn(control, "hidden sm:flex")}
        >
          <SkipBackIcon className="size-4" />
        </button>
        <button
          aria-label={playing ? "Приостановить опенинг" : "Включить опенинг"}
          onClick={musicSession.toggle}
          className={control}
        >
          {state.status === "loading" ? (
            <Loader2Icon className="size-5 animate-spin" />
          ) : playing ? (
            <PauseIcon className="size-5 fill-current" />
          ) : (
            <PlayIcon className="size-5 fill-current" />
          )}
        </button>
        <button
          aria-label="Следующий опенинг"
          disabled={state.index >= state.queue.length - 1}
          onClick={musicSession.next}
          className={control}
        >
          <SkipForwardIcon className="size-4" />
        </button>
        <label className="hidden items-center gap-2 sm:flex">
          <Volume2Icon className="size-4 text-white/55" />
          <span className="sr-only">Громкость музыки</span>
          <Slider
            aria-label="Громкость музыки"
            min={0}
            max={1}
            step={0.05}
            value={[state.volume]}
            onValueChange={([value]) => musicSession.setVolume(value ?? 0)}
            className={cn("w-16", PLAYER_SLIDER)}
          />
        </label>
        <button
          aria-label="Закрыть музыкальный плеер"
          onClick={musicSession.close}
          className={control}
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="mx-4 flex h-6 items-center">
        <Slider
          aria-label="Позиция опенинга"
          min={0}
          max={state.duration || 1}
          step={0.1}
          value={[Math.min(state.time, state.duration || 1)]}
          disabled={!state.duration}
          onValueChange={([value]) => musicSession.seek(value ?? 0)}
          className={cn("w-full", PLAYER_SLIDER)}
        />
      </div>
      <div className="flex justify-between px-4 pb-2 text-[10px] tabular-nums text-white/55">
        <span>{musicTime(state.time)}</span>
        <span className="truncate px-3">
          {track.animeTitle} · {track.label}
        </span>
        <span>{musicTime(state.duration)}</span>
      </div>
    </aside>
  );
}
