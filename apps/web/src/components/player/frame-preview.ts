import type Hls from "hls.js";
import { hlsConfig, loadHls } from "./hls-engine";

/** One frame per this many seconds of the episode. */
const STEP = 5;
const W = 192;
const H = 108;

/**
 * Frames for the seek bar's tooltip.
 *
 * Two sources, cheapest first:
 *  - the playing video itself: every few seconds of what has been watched
 *    is copied into a small canvas as it goes by, so going back costs
 *    nothing;
 *  - for the rest, a hidden second video at the lowest quality, seeked to
 *    where the pointer rests. One request at a time, only for the last
 *    place asked for, never while the main picture is waiting for data —
 *    the preview must not steal a slow line from the episode itself.
 */
export class FramePreview {
  private frames = new Map<number, HTMLCanvasElement>();
  private listeners = new Set<() => void>();
  private probe: HTMLVideoElement | null = null;
  private hls: Hls | null = null;
  private wanted: number | null = null;
  private busy = false;
  private dead = false;

  constructor(
    /** The lowest-quality playlist of this episode. */
    private readonly src: string | null,
    /** True while the main video is short of data. */
    private readonly mainStarved: () => boolean,
  ) {}

  private key(t: number): number {
    return Math.round(t / STEP);
  }

  private draw(video: HTMLVideoElement): HTMLCanvasElement | null {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch {
      return null;
    }
    return canvas;
  }

  /** Called as the main video plays: keeps the frame on screen, if new. */
  capture(video: HTMLVideoElement): void {
    if (this.dead || video.seeking) return;
    const k = this.key(video.currentTime);
    if (this.frames.has(k) || Math.abs(video.currentTime - k * STEP) > 1.2) return;
    const canvas = this.draw(video);
    if (canvas) {
      this.frames.set(k, canvas);
      this.emit();
    }
  }

  /** The frame for this moment, or the nearest one within half a minute. */
  nearest(t: number): { canvas: HTMLCanvasElement; exact: boolean } | null {
    const k = this.key(t);
    const exact = this.frames.get(k);
    if (exact) return { canvas: exact, exact: true };
    for (let d = 1; d <= 6; d++) {
      const near = this.frames.get(k - d) ?? this.frames.get(k + d);
      if (near) return { canvas: near, exact: false };
    }
    return null;
  }

  /** Asks for the frame at `t`; listeners hear when it (or any) arrives. */
  request(t: number): void {
    if (this.dead || !this.src || this.frames.has(this.key(t))) return;
    this.wanted = t;
    if (!this.busy) void this.pump();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy(): void {
    this.dead = true;
    this.listeners.clear();
    this.hls?.destroy();
    this.hls = null;
    this.probe?.remove();
    this.probe = null;
    this.frames.clear();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private started = false;

  private async ensureProbe(at: number): Promise<HTMLVideoElement | null> {
    if (this.probe) {
      this.begin(at);
      return this.probe;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    // In the page (some browsers won't decode a detached element), but unseen.
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    this.probe = video;
    const native = video.canPlayType("application/vnd.apple.mpegurl") !== "" && /Apple/.test(navigator.vendor);
    if (native) {
      video.src = this.src!;
      return video;
    }
    try {
      const HlsClass = await loadHls();
      if (this.dead || !HlsClass.isSupported()) return null;
      const hls = new HlsClass(
        hlsConfig({
          startLevel: 0,
          capLevelToPlayerSize: false,
          abrEwmaDefaultEstimate: 300_000,
          maxBufferLength: 1,
          maxMaxBufferLength: 2,
          backBufferLength: 0,
          startFragPrefetch: false,
          // Nothing is fetched until the first frame is asked for — and then
          // from that moment, not from the episode's start.
          autoStartLoad: false,
        }),
      );
      hls.loadSource(this.src!);
      hls.attachMedia(video);
      this.hls = hls;
      this.begin(at);
      return video;
    } catch {
      return null;
    }
  }

  private begin(at: number): void {
    if (this.started || !this.hls) return;
    this.started = true;
    this.hls.startLoad(at);
  }

  private async pump(): Promise<void> {
    this.busy = true;
    try {
      while (!this.dead && this.wanted != null) {
        if (this.mainStarved()) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        const t = this.wanted;
        this.wanted = null;
        const k = this.key(t);
        if (this.frames.has(k)) continue;
        const video = await this.ensureProbe(k * STEP);
        if (!video) return;
        const ok = await seekTo(video, k * STEP);
        if (!ok || this.dead) continue;
        const canvas = this.draw(video);
        if (canvas) {
          this.frames.set(k, canvas);
          this.emit();
        }
      }
    } finally {
      this.busy = false;
    }
  }
}

/** Seeks and waits for a decoded frame there — or gives up after 10 s. */
function seekTo(video: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(ok);
    };
    const onSeeked = () => {
      // The frame may still be decoding right after "seeked".
      if (video.readyState >= 2) finish(true);
      else video.addEventListener("loadeddata", () => finish(true), { once: true });
    };
    const timer = setTimeout(() => finish(false), 10_000);
    video.addEventListener("seeked", onSeeked);
    const go = () => {
      try {
        video.currentTime = Math.max(0.1, t);
      } catch {
        finish(false);
      }
    };
    if (video.readyState >= 1) go();
    else video.addEventListener("loadedmetadata", go, { once: true });
  });
}
