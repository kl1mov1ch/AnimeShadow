import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FramePreview } from "./frame-preview";
import { SEGMENT_LABEL, type SkipSegment } from "@/lib/skip-times";

const SEGMENT_TONE: Record<SkipSegment["kind"], string> = {
  op: "bg-amber-300/55",
  ed: "bg-violet-300/55",
  recap: "bg-sky-300/50",
};

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The seek bar: what's been watched, what's loaded, where the opening is —
 * and, under the pointer or the finger, a picture of that moment with its
 * time, as on the big video sites. Dragging moves the picture along; the
 * video itself jumps once, on release.
 */
export function SeekBar({
  duration,
  current,
  buffered,
  segments = [],
  marks = [],
  preview,
  fill,
  onScrub,
  onCommit,
  onActivity,
  label,
}: {
  duration: number;
  current: number;
  /** Loaded ranges, in seconds. */
  buffered: Array<[number, number]>;
  /** The opening, ending and recap, marked on the bar and named in the preview. */
  segments?: SkipSegment[];
  /** Comments tied to moments: dots above the bar, the nearest one shown in the preview. */
  marks?: Array<{ id: string; atSeconds: number; body: string; author: string }>;
  preview: FramePreview | null;
  /** The watched part's colour (a CSS background). */
  fill: string;
  onScrub: (t: number | null) => void;
  onCommit: (t: number) => void;
  onActivity: () => void;
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ t: number; x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [frameState, setFrameState] = useState<"none" | "near" | "exact">("none");
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const at = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
    return { t: duration > 0 ? (x / rect.width) * duration : 0, x, width: rect.width };
  };

  // Draws the frame for the pointer's moment; asks for it once the pointer rests.
  const hoverT = hover?.t ?? null;
  useEffect(() => {
    if (hoverT == null || !preview) return;
    const paint = () => {
      const found = preview.nearest(hoverT);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (found && ctx) {
        ctx.drawImage(found.canvas, 0, 0, canvas.width, canvas.height);
        setFrameState(found.exact ? "exact" : "near");
      } else {
        setFrameState("none");
      }
    };
    paint();
    const off = preview.subscribe(paint);
    if (restTimer.current) clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => preview.request(hoverT), dragging ? 260 : 160);
    return () => {
      off();
      if (restTimer.current) clearTimeout(restTimer.current);
    };
  }, [hoverT, preview, dragging]);

  const shown = dragging && hover ? hover.t : current;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;
  const hoverSegment = hover ? segments.find((x) => hover.t >= x.start && hover.t < x.stop) : undefined;
  // The comment under the pointer: within 1.5 % of the bar.
  const hoverMark = hover && duration > 0 ? marks.find((m) => Math.abs(m.atSeconds - hover.t) < duration * 0.015) : undefined;

  // The tooltip stays inside the bar's width.
  const TIP = 192;
  const tipLeft = hover ? Math.min(Math.max(hover.x - TIP / 2, 0), Math.max(0, hover.width - TIP)) : 0;

  return (
    <div
      className="group/seek relative flex h-6 touch-none items-center pointer-coarse:h-8"
      onPointerMove={(e) => {
        if (duration <= 0) return;
        const point = at(e.clientX);
        setHover(point);
        if (dragging) onScrub(point.t);
        onActivity();
      }}
      onPointerLeave={() => {
        if (!dragging) setHover(null);
      }}
      onPointerDown={(e) => {
        if (duration <= 0 || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const point = at(e.clientX);
        setHover(point);
        setDragging(true);
        onScrub(point.t);
        onActivity();
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        const point = at(e.clientX);
        setDragging(false);
        onScrub(null);
        onCommit(point.t);
        if (e.pointerType !== "mouse") setHover(null);
      }}
      onPointerCancel={() => {
        setDragging(false);
        setHover(null);
        onScrub(null);
      }}
    >
      {/* The preview: a frame (when there is one) and the time. */}
      {hover && (
        <div
          className="pointer-events-none absolute bottom-full z-30 mb-2 flex flex-col items-center gap-1"
          style={{ left: tipLeft, width: TIP }}
        >
          {preview && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/80 shadow-[0_8px_30px_rgba(0,0,0,0.6)] ring-2 ring-white/85">
              <canvas
                ref={canvasRef}
                width={192}
                height={108}
                className={cn("size-full transition-[filter,opacity] duration-200", frameState === "none" && "opacity-0", frameState === "near" && "blur-[2px] brightness-75")}
              />
              {frameState !== "exact" && (
                <span className="absolute inset-0 grid place-items-center">
                  <Loader2Icon className="size-5 animate-spin text-white/80" />
                </span>
              )}
              {hoverSegment && (
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-white">
                  {SEGMENT_LABEL[hoverSegment.kind]}
                </span>
              )}
            </div>
          )}
          <span className="rounded-md bg-black/85 px-2 py-0.5 font-display text-xs tabular-nums text-white shadow">
            {formatTime(hover.t)}
          </span>
          {hoverMark && (
            <span className="w-full rounded-lg bg-black/85 px-2 py-1 text-[11px] leading-snug text-white shadow">
              <b className="text-primary">{hoverMark.author}:</b> <span className="line-clamp-3">{hoverMark.body}</span>
            </span>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatTime(shown)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 30 : 5;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            onCommit(Math.min(duration, Math.max(0, current + (e.key === "ArrowLeft" ? -step : step))));
          }
        }}
        className="relative h-1 w-full rounded-full bg-white/20 outline-none transition-[height] duration-150 group-hover/seek:h-1.5 focus-visible:ring-2 focus-visible:ring-white/70 pointer-coarse:h-1.5"
      >
        {buffered.map(([from, to]) => (
          <span
            key={from}
            className="absolute inset-y-0 rounded-full bg-white/35"
            style={{ left: `${(from / Math.max(1, duration)) * 100}%`, width: `${((to - from) / Math.max(1, duration)) * 100}%` }}
          />
        ))}
        {duration > 0 &&
          segments.map((seg) => (
            <span
              key={`${seg.kind}-${seg.start}`}
              title={SEGMENT_LABEL[seg.kind]}
              className={cn("absolute inset-y-0", SEGMENT_TONE[seg.kind])}
              style={{ left: `${(seg.start / duration) * 100}%`, width: `${((seg.stop - seg.start) / duration) * 100}%` }}
            />
          ))}
        {hover && !dragging && (
          <span className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${(hover.t / Math.max(1, duration)) * 100}%` }} />
        )}
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: fill }} />
        {duration > 0 &&
          marks.map((m) => (
            <span
              key={m.id}
              aria-hidden
              className="absolute -top-1.5 size-1.5 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_6px_rgb(125_211_252)]"
              style={{ left: `${(m.atSeconds / duration) * 100}%` }}
            />
          ))}
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_2px_6px_rgba(0,0,0,0.5)] transition-transform duration-150",
            dragging ? "scale-125" : "scale-0 group-hover/seek:scale-100 pointer-coarse:scale-90",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
