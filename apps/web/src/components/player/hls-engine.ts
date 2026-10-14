import type Hls from "hls.js";
import type { HlsConfig } from "hls.js";

/**
 * Our own player's streaming, apart from its controls.
 *
 * Built for a slow line (4 Mbit/s and less) and a provider whose CDN hops
 * through redirects and now and then drops a segment:
 *  - starts at the quality the line can carry (the browser's own estimate
 *    when it has one, else a careful 0.9 Mbit/s) and climbs from there;
 *  - waits longer for a slow first byte instead of calling a working
 *    stream dead, and retries a failed segment with a growing pause;
 *  - after a fatal network error goes one quality down and loads again,
 *    after a fatal decoding error recovers the media pipeline — and only
 *    when all of that has failed says so (`onFatal`);
 *  - reports what it's doing (`onStatus`) so the picture can say "loading,
 *    480p, 1.1 Mbit/s" instead of being a black rectangle.
 */

export type EngineStatus =
  | { kind: "loading" }
  | { kind: "retrying"; attempt: number }
  | { kind: "ok" }
  | { kind: "failed"; reason: string };

export interface EngineHandle {
  destroy: () => void;
  /** -1 is automatic. */
  setLevel: (index: number) => void;
  /** The line's measured speed, bits per second (0 while unknown). */
  bandwidth: () => number;
  levels: () => Array<{ height: number }>;
  /** Never above this height (a room watching at its slowest member's pace); null lifts it. */
  capHeight: (height: number | null) => void;
}

/** hls.js, fetched once and early: on the title page, before "play" is pressed. */
let hlsModule: Promise<typeof Hls> | null = null;
export function loadHls(): Promise<typeof Hls> {
  hlsModule ??= import("hls.js/light").then((m) => m.default).catch((error: unknown) => {
    hlsModule = null;
    throw error;
  });
  return hlsModule;
}

/** Starts fetching hls.js in the background, when the browser is idle. */
export function warmHls(): void {
  const run = () => void loadHls().catch(() => undefined);
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 800);
}

/** A slow line (or the browser's data saver): load gently, keep more ahead. */
export function slowLine(): boolean {
  const c = (navigator as Navigator & { connection?: { downlink?: number; saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  return Boolean(c.saveData) || (c.downlink != null && c.downlink > 0 && c.downlink < 1.5) || c.effectiveType === "2g" || c.effectiveType === "3g";
}

/** A first guess at the line, in bits per second. */
function lineEstimate(): number {
  const downlink = (navigator as Navigator & { connection?: { downlink?: number; saveData?: boolean } }).connection;
  if (downlink?.saveData) return 400_000;
  if (downlink?.downlink && downlink.downlink > 0) return Math.min(8_000_000, downlink.downlink * 1_000_000 * 0.7);
  return 900_000;
}

const retry = (maxNumRetry: number, retryDelayMs: number, maxRetryDelayMs: number) => ({
  maxNumRetry,
  retryDelayMs,
  maxRetryDelayMs,
  backoff: "exponential" as const,
});

export function hlsConfig(extra: Partial<HlsConfig> = {}): Partial<HlsConfig> {
  const slow = slowLine();
  return {
    enableWorker: true,
    abrEwmaDefaultEstimate: lineEstimate(),
    capLevelToPlayerSize: true,
    startFragPrefetch: true,
    // A slow line starts at the lowest quality.
    ...(slow ? { startLevel: 0 } : {}),
    // Going up only with real room to spare, coming down early: no segment
    // fetched in a quality the line then can't keep up with (and thrown away).
    abrBandWidthFactor: 0.85,
    abrBandWidthUpFactor: slow ? 0.5 : 0.65,
    // Ahead: enough to ride out a slow segment. A slow line keeps loading
    // further while paused (up to two minutes), so a pause buys smooth play.
    maxBufferLength: slow ? 40 : 24,
    maxMaxBufferLength: slow ? 120 : 60,
    backBufferLength: slow ? 15 : 30,
    maxBufferHole: 0.5,
    nudgeMaxRetry: 6,
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 15_000,
        maxLoadTimeMs: 90_000,
        timeoutRetry: retry(4, 0, 0),
        errorRetry: retry(6, 800, 8_000),
      },
    },
    playlistLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: retry(3, 0, 0),
        errorRetry: retry(4, 800, 6_000),
      },
    },
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: retry(3, 0, 0),
        errorRetry: retry(4, 800, 6_000),
      },
    },
    ...extra,
  };
}

export function attachEngine(
  HlsClass: typeof Hls,
  video: HTMLVideoElement,
  source: string,
  {
    startLevel,
    startPosition = -1,
    onLevels,
    onLevelSwitched,
    onManifest,
    onStatus,
    onFatal,
  }: {
    /** A quality the viewer picked (an index), or undefined for automatic. */
    startLevel?: (heights: number[]) => number;
    /** Where to begin fetching — the resume point, so a returning viewer
     *  doesn't first download the episode's opening seconds for nothing. */
    startPosition?: number;
    onLevels: (heights: number[]) => void;
    onLevelSwitched: (height: number | null) => void;
    onManifest: () => void;
    onStatus: (status: EngineStatus) => void;
    onFatal: (reason: string) => void;
  },
): EngineHandle {
  const hls = new HlsClass(hlsConfig({ startPosition }));
  let networkRetries = 0;
  let mediaRetries = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dead = false;

  hls.on(HlsClass.Events.MANIFEST_PARSED, (_e, data) => {
    const heights = data.levels.map((l) => l.height ?? 0);
    onLevels(heights);
    const picked = startLevel?.(heights) ?? -1;
    if (picked >= 0) hls.currentLevel = picked;
    onManifest();
  });
  hls.on(HlsClass.Events.LEVEL_SWITCHED, (_e, data) => onLevelSwitched(hls.levels[data.level]?.height ?? null));
  hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
    if (networkRetries > 0 || mediaRetries > 0) onStatus({ kind: "ok" });
    networkRetries = 0;
  });

  hls.on(HlsClass.Events.ERROR, (_e, data) => {
    if (!data.fatal || dead) return;
    if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR && networkRetries < 5) {
      networkRetries += 1;
      onStatus({ kind: "retrying", attempt: networkRetries });
      // One step down before trying again: the likeliest cause on a slow
      // line is a segment too big to arrive in time.
      const current = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
      if (current > 0) hls.nextLoadLevel = current - 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!dead) hls.startLoad(video.currentTime > 0 ? video.currentTime : -1);
      }, Math.min(8_000, 1_000 * 2 ** (networkRetries - 1)));
      return;
    }
    if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
      mediaRetries += 1;
      onStatus({ kind: "retrying", attempt: mediaRetries });
      if (mediaRetries === 2) hls.swapAudioCodec();
      hls.recoverMediaError();
      return;
    }
    const reason = `${data.type}:${data.details}`;
    console.warn("[AnimeShadow] stream gave up", reason);
    onStatus({ kind: "failed", reason });
    onFatal(reason);
  });

  onStatus({ kind: "loading" });
  hls.loadSource(source);
  hls.attachMedia(video);

  return {
    destroy: () => {
      dead = true;
      if (timer) clearTimeout(timer);
      hls.destroy();
    },
    setLevel: (index) => {
      hls.currentLevel = index;
    },
    bandwidth: () => (Number.isFinite(hls.bandwidthEstimate) ? hls.bandwidthEstimate : 0),
    levels: () => hls.levels.map((l) => ({ height: l.height })),
    capHeight: (height) => {
      if (height == null) {
        hls.autoLevelCapping = -1;
        return;
      }
      let index = -1;
      hls.levels.forEach((l, i) => {
        if (l.height <= height) index = i;
      });
      hls.autoLevelCapping = Math.max(0, index);
      if (hls.currentLevel > hls.autoLevelCapping) hls.currentLevel = -1;
    },
  };
}
