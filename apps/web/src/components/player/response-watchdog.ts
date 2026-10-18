export const SOURCE_RESPONSE_MS = 3_000;

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

/** No source churn while paused, in a background tab, or offline. */
export function watchMediaResponse(video: HTMLVideoElement, onTimeout: () => void, initialDelayMs = SOURCE_RESPONSE_MS) {
  const watchdog = new ResponseWatchdog(onTimeout, initialDelayMs);
  const suspend = () => watchdog.suspend(document.visibilityState === "hidden" || !navigator.onLine);
  const progress = () => {
    // A cold same-origin manifest may still be resolving at the provider.
    // Once metadata exists, ordinary playback retains the three-second guard.
    if (video.readyState > 0) watchdog.useDelay(SOURCE_RESPONSE_MS);
    watchdog.progress();
  };
  const ready = () => watchdog.ready();
  const wait = () => { if (!video.paused) watchdog.wait(); };
  const play = () => { if (video.readyState < 3) wait(); };
  const events: Array<[string, () => void]> = [
    ["progress", progress], ["loadedmetadata", progress],
    ["loadeddata", ready], ["canplay", ready], ["playing", ready],
    ["play", play],
    ["waiting", wait], ["stalled", wait], ["seeking", wait],
    ["pause", ready], ["ended", ready],
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
