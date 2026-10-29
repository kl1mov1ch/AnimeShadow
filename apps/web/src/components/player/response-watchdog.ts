export const SOURCE_RESPONSE_MS = 3_000;
/** A direct stream gets this long to show its first frame before it counts as dead. */
export const STREAM_START_MS = 12_000;
/** Once a stream has played, only a stall this long (online, tab visible) earns a reload. */
export const STREAM_STALL_MS = 25_000;

/** A bounded inactivity check: real network progress buys the source more time. */
export class ResponseWatchdog {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private suspended = false;
  private failed = false;

  constructor(private readonly onTimeout: () => void, private delay = SOURCE_RESPONSE_MS) {}

  useDelay(delay: number): void { this.delay = delay; }

  wait(): void {
    if (this.failed || this.active) return;
    this.active = true;
    this.progress();
  }

  progress(): void {
    clearTimeout(this.timer);
    if (!this.active || this.suspended || this.failed) return;
    this.timer = setTimeout(() => {
      this.failed = true;
      this.active = false;
      this.onTimeout();
    }, this.delay);
  }

  ready(): void {
    this.active = false;
    clearTimeout(this.timer);
  }

  suspend(value: boolean): void {
    this.suspended = value;
    this.progress();
  }

  destroy(): void {
    this.failed = true;
    this.ready();
  }
}

/**
 * Two different questions, asked at two different times:
 *  - before the first frame: is this source answering at all? If not within
 *    `startMs` (each loaded segment buys more time) — `onTimeout`, and the
 *    page tries another source;
 *  - after it has played: a stall is the line, not the source. hls.js
 *    retries on its own; only a stall of `STREAM_STALL_MS` with no data at
 *    all calls `onStall`, and the player reloads the *same* stream in place.
 *
 * The old guard asked the first question all the time with three seconds of
 * patience: every slow segment after a seek (and a watch-together room seeks
 * a lot) threw away a working stream and loaded another dub from scratch.
 *
 * No timers run while paused, in a background tab, or offline.
 */
export function watchMediaResponse(
  video: HTMLVideoElement,
  onTimeout: () => void,
  startMs = STREAM_START_MS,
  onStall?: () => void,
) {
  let started = false;
  const watchdog = new ResponseWatchdog(() => (started ? onStall?.() : onTimeout()), startMs);
  const suspend = () => watchdog.suspend(document.visibilityState === "hidden" || !navigator.onLine);
  const progress = () => watchdog.progress();
  const ready = () => {
    if (!started && video.readyState >= 2) {
      started = true;
      watchdog.useDelay(STREAM_STALL_MS);
    }
    watchdog.ready();
  };
  const wait = () => {
    if (video.paused) return;
    if (started && !onStall) return;
    watchdog.wait();
  };
  const play = () => { if (video.readyState < 3) wait(); };
  const pause = () => watchdog.ready();
  const events: Array<[string, () => void]> = [
    // Metadata is an answer: the source is real. A paused iPhone may stop
    // right there (preload "metadata") and that is not a failure.
    ["progress", progress], ["loadedmetadata", ready],
    ["loadeddata", ready], ["canplay", ready], ["playing", ready],
    ["play", play],
    ["waiting", wait], ["stalled", wait],
    ["pause", pause], ["ended", pause],
  ];
  for (const [event, handler] of events) video.addEventListener(event, handler);
  document.addEventListener("visibilitychange", suspend);
  window.addEventListener("online", suspend);
  window.addEventListener("offline", suspend);
  suspend();
  watchdog.wait();
  return {
    progress,
    destroy: () => {
      watchdog.destroy();
      for (const [event, handler] of events) video.removeEventListener(event, handler);
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("online", suspend);
      window.removeEventListener("offline", suspend);
    },
  };
}
