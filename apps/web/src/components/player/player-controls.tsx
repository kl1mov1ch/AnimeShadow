import { Volume1Icon, Volume2Icon, VolumeIcon, VolumeXIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Volume: the speaker shows the level (none, low, high, off), and beside it
 * a short bar with the level in the site's colours, a white knob and the
 * percentage above it while it's being changed. Opens on hover, takes the
 * mouse wheel, and a click on the speaker mutes or brings the sound back.
 * A phone gets only the speaker — it has its own volume keys.
 */
export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
  labels,
}: {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
  labels: { mute: string; unmute: string; volume: string };
}) {
  const level = muted ? 0 : volume;
  const Icon = muted || volume === 0 ? VolumeXIcon : volume < 0.34 ? VolumeIcon : volume < 0.67 ? Volume1Icon : Volume2Icon;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const fromPointer = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    onVolume(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100) / 100);
  };

  return (
    <div
      className="group/vol flex items-center rounded-full pr-1 transition-colors hover:bg-white/10 focus-within:bg-white/10"
      onWheel={(e) => {
        e.preventDefault();
        onVolume(Math.min(1, Math.max(0, Math.round((level + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100)));
      }}
    >
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted || volume === 0 ? labels.unmute : labels.mute}
        className={cn(
          "grid size-9 place-items-center rounded-full text-white transition-transform active:scale-90",
          (muted || volume === 0) && "text-rose-300",
        )}
      >
        <Icon className="size-[18px]" />
      </button>
      <div className="w-0 overflow-hidden transition-[width] duration-300 ease-out group-hover/vol:w-[5.5rem] group-focus-within/vol:w-[5.5rem] pointer-coarse:hidden">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={labels.volume}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") onVolume(Math.max(0, level - 0.05));
            else if (e.key === "ArrowRight" || e.key === "ArrowUp") onVolume(Math.min(1, level + 0.05));
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setActive(true);
            fromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (active) fromPointer(e.clientX);
          }}
          onPointerUp={() => setActive(false)}
          onPointerCancel={() => setActive(false)}
          className="relative mx-2 flex h-9 w-[4.5rem] cursor-pointer touch-none items-center outline-none"
        >
          <span className="absolute inset-x-0 h-1 rounded-full bg-white/20" />
          <span
            className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-primary via-fuchsia-400 to-sky-300"
            style={{ width: `${level * 100}%` }}
          />
          <span
            className={cn(
              "absolute size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] transition-transform",
              active && "scale-125",
            )}
            style={{ left: `${level * 100}%` }}
          />
          <span
            className={cn(
              "pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-black/85 px-1.5 text-[10px] font-semibold tabular-nums text-white opacity-0 transition-opacity",
              active && "opacity-100",
            )}
            style={{ left: `${level * 100}%` }}
          >
            {Math.round(level * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Skip back / on: a circular arrow with the number of seconds inside it,
 * drawn rather than taken from an icon set so the number sits in the
 * middle at any size. The arrow turns a little on each press, and a
 * "−10" / "+10" floats off it.
 */
export function SkipButton({
  dir,
  seconds,
  onSkip,
  label,
  size = "bar",
  className,
}: {
  dir: -1 | 1;
  seconds: number;
  onSkip: () => void;
  label: string;
  /** "bar": in the control bar; "center": the big round one on the picture. */
  size?: "bar" | "center";
  className?: string;
}) {
  const [pulse, setPulse] = useState(0);
  const big = size === "center";
  return (
    <button
      type="button"
      onClick={() => {
        onSkip();
        setPulse((n) => n + 1);
      }}
      aria-label={label}
      title={label}
      className={cn(
        "group/skip relative grid shrink-0 place-items-center rounded-full text-white transition-[transform,background-color] active:scale-90",
        big ? "size-12 bg-black/45 ring-1 ring-white/15 backdrop-blur-sm @md/player:size-14" : "size-9 hover:bg-white/12",
        className,
      )}
    >
      <svg
        key={pulse}
        viewBox="0 0 24 24"
        aria-hidden
        className={cn(
          big ? "size-8 @md/player:size-9" : "size-[22px]",
          pulse > 0 && (dir < 0 ? "animate-[skip-back_.35s_ease-out]" : "animate-[skip-on_.35s_ease-out]"),
        )}
        style={dir < 0 ? { transform: "scaleX(-1)" } : undefined}
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 3v5h-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("pointer-events-none absolute inset-0 grid place-items-center pt-[1px] font-bold tabular-nums", big ? "text-[11px] @md/player:text-xs" : "text-[8.5px]")}>
        {seconds}
      </span>
      {pulse > 0 && (
        <span
          key={`f${pulse}`}
          className={cn(
            "pointer-events-none absolute -top-3 animate-[skip-float_.6s_ease-out_forwards] rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground opacity-0",
          )}
        >
          {dir < 0 ? "−" : "+"}
          {seconds}
        </span>
      )}
    </button>
  );
}
