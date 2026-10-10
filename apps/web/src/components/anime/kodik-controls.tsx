import {
  FastForwardIcon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Settings2Icon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerSettingsMenu } from "@/components/anime/player-settings-menu";
import { useDismiss } from "@/hooks/use-dismiss";
import { useT } from "@/i18n";
import { formatClock } from "@/lib/episodes";
import { useKodikBridge } from "@/lib/kodik-bridge";
import { SPEEDS, setPlayerSetting, speedLabel, usePlayerSettings } from "@/lib/player-settings";
import { cn } from "@/lib/utils";

interface Range {
  start: number;
  stop: number;
}

const BUTTON =
  "grid size-8 shrink-0 place-items-center rounded-lg text-foreground/75 transition-colors duration-200 hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

/**
 * The site's own controls for a Kodik player, under its picture: play and
 * pause, skips of a chosen length, a timeline you can drag (with the
 * opening and ending marked on it), speed, volume, the neighbouring
 * episodes and fullscreen. All of it goes through Kodik's own player API;
 * the player keeps its interface and its adverts, and quality stays in its
 * menu — the API has no command for it.
 *
 * Shown only once the player has spoken through the API: a player that
 * doesn't (an error page, a region block) gets no dead buttons.
 */
export function KodikControls({
  frame,
  opening,
  ending,
  hasPrev = false,
  onPrev,
  hasNext,
  onNext,
  fullscreenTarget,
  compact = false,
  className,
}: {
  frame: HTMLIFrameElement | null;
  opening: Range | null;
  ending: Range | null;
  hasPrev?: boolean;
  onPrev?: () => void;
  hasNext: boolean;
  onNext: () => void;
  /** What goes fullscreen: the player and these controls together. */
  fullscreenTarget?: HTMLElement | null;
  /** Fewer buttons, for the picture-in-picture window. */
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const prefs = usePlayerSettings();
  const [alive, setAlive] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // A new frame (another episode, another dub, moved to another window)
  // starts from nothing until it speaks.
  useEffect(() => {
    setAlive(false);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setSpeed(1);
  }, [frame]);

  const wantedSpeed = useRef(prefs.speed);
  wantedSpeed.current = prefs.speed;

  const kodik = useKodikBridge(frame, {
    onAlive: () => setAlive(true),
    onTime: (seconds) => {
      setTime(seconds);
      setPlaying(true);
    },
    onDuration: setDuration,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onSeek: (seconds) => {
      if (seconds != null) setTime(seconds);
    },
    onMuted: setMuted,
    onVolume: (level) => {
      setVolume(level);
      if (level > 0) setMuted(false);
    },
    onSpeed: setSpeed,
    // Every episode starts at normal speed inside the player; the viewer's
    // own choice is put back as soon as the video is actually running.
    onStarted: () => {
      setPlaying(true);
      if (wantedSpeed.current !== 1) kodik.speed(wantedSpeed.current);
    },
  });

  useEffect(() => {
    const doc = fullscreenTarget?.ownerDocument ?? document;
    const onChange = () => setFullscreen(doc.fullscreenElement != null);
    doc.addEventListener("fullscreenchange", onChange);
    return () => doc.removeEventListener("fullscreenchange", onChange);
  }, [fullscreenTarget]);

  // The settings panel closes on a click anywhere else, or Escape.
  useDismiss(menu, useCallback(() => setMenu(false), []), root);

  const seekBy = (delta: number) => {
    const next = Math.min(Math.max(0, time + delta), duration > 0 ? duration - 1 : Number.POSITIVE_INFINITY);
    kodik.seek(next);
    setTime(next);
  };
  const togglePlay = () => (playing ? kodik.pause() : kodik.play());
  const toggleMute = () => {
    if (muted || volume === 0) {
      kodik.unmute();
      if (volume === 0) kodik.volume(0.5);
      setMuted(false);
    } else {
      kodik.mute();
      setMuted(true);
    }
  };
  const changeVolume = (level: number) => {
    kodik.volume(level);
    setVolume(level);
    if (level > 0 && muted) {
      kodik.unmute();
      setMuted(false);
    }
  };
  const changeSpeed = (rate: number) => {
    kodik.speed(rate);
    setSpeed(rate);
    setPlayerSetting({ speed: rate });
  };
  const toggleFullscreen = () => {
    const doc = fullscreenTarget?.ownerDocument ?? document;
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
    else void fullscreenTarget?.requestFullscreen?.().catch(() => undefined);
  };

  // Keys, the way every video site has them — while the player is what the
  // viewer is busy with: focus on these controls, or on nothing in
  // particular with the player in view. Inside the frame itself, Kodik's
  // own keys apply.
  const keys = useRef({ togglePlay, seekBy, toggleMute, toggleFullscreen, changeSpeed, speed, step: prefs.step });
  keys.current = { togglePlay, seekBy, toggleMute, toggleFullscreen, changeSpeed, speed, step: prefs.step };
  useEffect(() => {
    const host = root.current?.ownerDocument.defaultView;
    if (!alive || !host) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=slider]")) return;
      const doc = host.document;
      const active = doc.activeElement;
      const ours = root.current?.contains(active) || fullscreenTarget?.contains(active);
      if (!ours) {
        if (active && active !== doc.body) return;
        const box = root.current?.getBoundingClientRect();
        if (!box || box.bottom < 0 || box.top > host.innerHeight) return;
      }
      const k = keys.current;
      const at = SPEEDS.indexOf(k.speed as (typeof SPEEDS)[number]);
      let handled = true;
      if (event.shiftKey) {
        if (event.code === "Period" && at < SPEEDS.length - 1) k.changeSpeed(SPEEDS[at + 1]!);
        else if (event.code === "Comma" && at > 0) k.changeSpeed(SPEEDS[at - 1]!);
        else handled = false;
      } else {
        switch (event.code) {
          case "Space":
          case "KeyK":
            k.togglePlay();
            break;
          case "ArrowLeft":
          case "KeyJ":
            k.seekBy(-k.step);
            break;
          case "ArrowRight":
          case "KeyL":
            k.seekBy(k.step);
            break;
          case "KeyM":
            k.toggleMute();
            break;
          case "KeyF":
            k.toggleFullscreen();
            break;
          default:
            handled = false;
        }
      }
      if (handled) event.preventDefault();
    };
    host.addEventListener("keydown", onKey);
    return () => host.removeEventListener("keydown", onKey);
  }, [alive, fullscreenTarget]);

  if (!alive) return null;

  const inOpening = opening != null && time >= opening.start && time < opening.stop - 2;
  const step = prefs.step;
  const VolumeIcon = muted || volume === 0 ? VolumeXIcon : volume < 0.5 ? Volume1Icon : Volume2Icon;

  return (
    <div
      ref={root}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 rounded-xl border border-border/60 bg-card/80 px-2.5 pb-1.5 pt-2",
        className,
      )}
    >
      <Timeline
        time={time}
        duration={duration}
        opening={opening}
        ending={ending}
        step={step}
        label={t("watch.ctl.seek")}
        onSeek={(seconds) => {
          kodik.seek(seconds);
          setTime(seconds);
        }}
      />

      <div className="flex items-center gap-0.5">
        {!compact && hasPrev && onPrev && (
          <button type="button" onClick={onPrev} title={t("watch.prevEpisode")} aria-label={t("watch.prevEpisode")} className={cn(BUTTON, "hidden sm:grid")}>
            <SkipBackIcon className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("watch.pause") : t("watch.play")}
          title={playing ? t("watch.pause") : t("watch.play")}
          className={cn(BUTTON, "text-primary hover:bg-primary/15 hover:text-primary")}
        >
          {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => seekBy(-step)}
          aria-label={t("watch.ctl.back", { n: step })}
          title={t("watch.ctl.back", { n: step })}
          className={cn(BUTTON, "relative")}
        >
          <RotateCcwIcon className="size-4" />
          <StepMark n={step} />
        </button>
        <button
          type="button"
          onClick={() => seekBy(step)}
          aria-label={t("watch.ctl.forward", { n: step })}
          title={t("watch.ctl.forward", { n: step })}
          className={cn(BUTTON, "relative")}
        >
          <RotateCwIcon className="size-4" />
          <StepMark n={step} />
        </button>
        <span className="ml-1.5 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatClock(time)}
          {duration > 0 && <span className="text-muted-foreground/55"> / {formatClock(duration)}</span>}
        </span>

        <span className="ml-auto flex items-center gap-0.5">
          {inOpening && (
            <button
              type="button"
              onClick={() => kodik.seek(opening!.stop)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground/[0.07] px-2.5 text-xs font-medium text-foreground/90 transition-colors duration-200 hover:bg-foreground/[0.12]"
            >
              <FastForwardIcon className="size-3.5" />
              {compact ? "OP" : t("watch.skipOpening")}
            </button>
          )}

          <span className="group/vol flex items-center">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? t("watch.unmute") : t("watch.mute")}
              title={muted || volume === 0 ? t("watch.unmute") : t("watch.mute")}
              className={BUTTON}
            >
              <VolumeIcon className="size-4" />
            </button>
            {!compact && (
              <span className="hidden w-0 overflow-hidden transition-[width] duration-300 ease-out group-hover/vol:w-20 group-focus-within/vol:w-20 sm:block">
                <span className="block w-20 px-2">
                  <LevelBar value={muted ? 0 : volume} label={t("watch.ctl.volume")} onChange={changeVolume} />
                </span>
              </span>
            )}
          </span>

          {!compact && (
            <button
              type="button"
              onClick={() => setMenu((open) => !open)}
              aria-expanded={menu}
              aria-label={t("watch.ctl.settings")}
              title={t("watch.ctl.settings")}
              className={cn(
                BUTTON,
                "flex h-8 w-auto min-w-8 items-center justify-center gap-1 px-1.5",
                menu && "bg-foreground/10 text-foreground",
              )}
            >
              <Settings2Icon className={cn("size-4 transition-transform duration-300", menu && "rotate-90")} />
              {speed !== 1 && <span className="text-[11px] font-medium tabular-nums">{speedLabel(speed)}</span>}
            </button>
          )}

          {hasNext && (
            <button type="button" onClick={onNext} aria-label={t("watch.nextEpisode")} title={`${t("watch.nextEpisode")} (Shift+N)`} className={BUTTON}>
              <SkipForwardIcon className="size-4" />
            </button>
          )}
          {!compact && fullscreenTarget && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? t("watch.exitFullscreen") : t("watch.fullscreen")}
              title={fullscreen ? t("watch.exitFullscreen") : t("watch.fullscreen")}
              className={BUTTON}
            >
              {fullscreen ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
            </button>
          )}
        </span>
      </div>

      {menu && (
        <PlayerSettingsMenu
          speed={speed}
          onSpeed={changeSpeed}
          step={step}
          onStep={(n) => setPlayerSetting({ step: n })}
          quality={{ note: t("watch.ctl.qualityKodik") }}
        />
      )}
    </div>
  );
}

/** The seconds a skip button jumps, tucked under its arrow. */
function StepMark({ n }: { n: number }) {
  return (
    <span className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-semibold leading-none tabular-nums">
      {n}
    </span>
  );
}

/**
 * The timeline: click or drag anywhere on it, with the time under the
 * pointer shown above it. The seek is sent once, when the drag ends — a
 * stream of seeks while dragging would make the player rebuffer at every
 * stop on the way.
 */
function Timeline({
  time,
  duration,
  opening,
  ending,
  step,
  label,
  onSeek,
}: {
  time: number;
  duration: number;
  opening: Range | null;
  ending: Range | null;
  step: number;
  label: string;
  onSeek: (seconds: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const timeAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || duration <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };
  const pct = (seconds: number) => (duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0);
  const shown = drag ?? time;
  const tip = drag ?? hover;
  const usable = duration > 0;

  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={usable ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatClock(shown)}
      onPointerDown={(event) => {
        if (!usable || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(timeAt(event.clientX));
      }}
      onPointerMove={(event) => {
        if (!usable) return;
        const at = timeAt(event.clientX);
        if (event.pointerType === "mouse") setHover(at);
        if (drag != null) setDrag(at);
      }}
      onPointerUp={(event) => {
        if (drag == null) return;
        onSeek(timeAt(event.clientX));
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(event) => {
        if (!usable) return;
        const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        if (event.key === "Home") onSeek(0);
        else if (event.key === "End") onSeek(Math.max(0, duration - 1));
        else if (delta) onSeek(Math.min(Math.max(0, time + delta), duration - 1));
        else return;
        event.preventDefault();
      }}
      className={cn(
        "group/tl relative flex h-4 touch-none items-center outline-none",
        usable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="relative h-1 w-full rounded-full bg-foreground/10 transition-[height] duration-200 ease-out group-hover/tl:h-1.5 group-focus-visible/tl:h-1.5">
        {opening && usable && (
          <span
            className="absolute inset-y-0 rounded-full bg-amber-400/35"
            style={{ left: `${pct(opening.start)}%`, width: `${pct(opening.stop) - pct(opening.start)}%` }}
          />
        )}
        {ending && usable && (
          <span
            className="absolute inset-y-0 rounded-full bg-sky-400/35"
            style={{ left: `${pct(ending.start)}%`, width: `${pct(ending.stop) - pct(ending.start)}%` }}
          />
        )}
        {tip != null && <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/15" style={{ width: `${pct(tip)}%` }} />}
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(shown)}%` }} />
      </div>
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm transition-transform duration-150 ease-out",
          drag != null ? "scale-110" : "scale-0 group-hover/tl:scale-100 group-focus-visible/tl:scale-100",
        )}
        style={{ left: `${pct(shown)}%` }}
      />
      {tip != null && usable && (
        <span
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md border border-border/70 bg-popover px-1.5 py-0.5 text-[11px] tabular-nums text-popover-foreground shadow-md shadow-black/25"
          style={{ left: `clamp(1.5rem, ${pct(tip)}%, calc(100% - 1.5rem))` }}
        >
          {formatClock(tip)}
        </span>
      )}
    </div>
  );
}

/** Volume: the same feel as the timeline, live while dragging. */
function LevelBar({ value, label, onChange }: { value: number; label: string; onChange: (value: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const at = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    return Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 20) / 20;
  };
  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onChange(at(event.clientX));
      }}
      onPointerMove={(event) => {
        if (dragging) onChange(at(event.clientX));
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -0.1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.1 : 0;
        if (!delta) return;
        event.preventDefault();
        onChange(Math.round(Math.min(1, Math.max(0, value + delta)) * 10) / 10);
      }}
      className="relative flex h-4 cursor-pointer touch-none items-center outline-none"
    >
      <span className="relative h-1 w-full rounded-full bg-foreground/10">
        <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: `${value * 100}%` }} />
      </span>
    </div>
  );
}
