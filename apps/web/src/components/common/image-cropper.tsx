import { Loader2Icon, MoveIcon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export interface CropSpec {
  /** Width over height of the result — 1 for an avatar, 3 for a background. */
  aspect: number;
  /** Pixel size of the result. */
  width: number;
  height: number;
  /** A round mask for avatars, so the preview matches what the profile shows. */
  round?: boolean;
}

const MAX_ZOOM = 4;

/** WebP where the browser can write it (far smaller), JPEG otherwise. */
function encode(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", 0.88);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Pick the part of a photo to keep: drag to move it, scroll, pinch or use
 * the slider to zoom. The frame is always covered — there is no way to end
 * up with empty edges — and the result is drawn at exactly the size the
 * site shows it at, so nothing oversized is ever uploaded.
 */
export function ImageCropper({
  file,
  spec,
  title,
  onCancel,
  onConfirm,
  pending,
}: {
  file: File | null;
  spec: CropSpec;
  title: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  pending?: boolean;
}) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  // Zoom 1 = the image just covers the frame. Offset is the image centre's
  // distance from the frame centre, in frame pixels.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame's rendered size, for converting drags into image movement.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFrame({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [img]);

  const cover = img && frame.w > 0 ? Math.max(frame.w / img.width, frame.h / img.height) : 1;
  const shownW = img ? img.width * cover * zoom : 0;
  const shownH = img ? img.height * cover * zoom : 0;

  /** Keeps the frame covered: the image may move only as far as its own overhang. */
  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      if (!img) return { x: 0, y: 0 };
      const maxX = Math.max(0, (img.width * cover * z - frame.w) / 2);
      const maxY = Math.max(0, (img.height * cover * z - frame.h) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    },
    [img, cover, frame],
  );

  const applyZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    setOffset((o) => clamp(o.x, o.y, z));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      applyZoom(pinch.current.zoom * (dist / pinch.current.dist));
      return;
    }
    const d = drag.current;
    if (!d) return;
    setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y, zoom));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  const confirm = () => {
    if (!img || frame.w === 0) return;
    // The frame's area, mapped back into the original image's pixels.
    const scale = cover * zoom;
    const sw = frame.w / scale;
    const sh = frame.h / scale;
    const sx = img.width / 2 - offset.x / scale - sw / 2;
    const sy = img.height / 2 - offset.y / scale - sh / 2;
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, spec.width, spec.height);
    onConfirm(encode(canvas));
  };

  return (
    <Dialog open={file != null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className={cn(spec.aspect > 1.5 ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <MoveIcon className="size-3.5" />
            {t("profile.crop.hint")}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={frameRef}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
          style={{ aspectRatio: String(spec.aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {img ? (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: shownW,
                height: shownH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {/* Rule-of-thirds guides, plus the round mask for avatars. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="border border-white/10" />
            ))}
          </div>
          {spec.round && (
            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
          )}
          {!spec.round && <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-white/70" />}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => applyZoom(zoom / 1.2)}
            aria-label={t("profile.crop.zoomOut")}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ZoomOutIcon className="size-4" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label={t("profile.crop.zoom")}
            className="theme-scrubber min-w-0 flex-1"
            style={{ ["--played" as string]: `${((zoom - 1) / (MAX_ZOOM - 1)) * 100}%` }}
          />
          <button
            type="button"
            onClick={() => applyZoom(zoom * 1.2)}
            aria-label={t("profile.crop.zoomIn")}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ZoomInIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label={t("profile.crop.reset")}
            title={t("profile.crop.reset")}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcwIcon className="size-4" />
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={!img || pending}>
            {pending && <Loader2Icon className="size-4 animate-spin" />}
            {t("profile.crop.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
