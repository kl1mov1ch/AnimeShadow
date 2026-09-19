import { useSyncExternalStore } from "react";

/**
 * How good the visitor's connection is, as far as the browser will say.
 *
 * Read from the Network Information API, which exists in Chromium-based
 * browsers only — Chrome, Edge, Samsung Internet, Chrome on Android. Safari
 * (so every iPhone) and Firefox do not expose it at all, and there this
 * reports "not slow": with no signal to go on, the page behaves exactly as it
 * did before rather than degrading everyone on a guess.
 */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  /** Estimated bandwidth in Mbps, rounded and capped by the browser. */
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** Below this the heavy extras cost more than they give. */
const SLOW_DOWNLINK_MBPS = 1.5;

/**
 * True when the heavy, optional parts of a page should be skipped: the
 * visitor asked to save data, the connection reports as 2G/3G, or measured
 * bandwidth is under 1.5Mbps.
 *
 * "Optional" is the important word. This decides whether to fetch a
 * widescreen banner or a 1080p poster or a background video — never whether
 * the page's actual content loads.
 */
export function isSlowConnection(): boolean {
  const c = connection();
  if (!c) return false;
  if (c.saveData) return true;
  if (c.effectiveType && /2g|3g/.test(c.effectiveType)) return true;
  if (typeof c.downlink === "number" && c.downlink > 0 && c.downlink < SLOW_DOWNLINK_MBPS) {
    return true;
  }
  return false;
}

function subscribe(onChange: () => void): () => void {
  const c = connection();
  // The connection can change under an open tab — Wi-Fi to mobile data on
  // the way out the door — and the page should notice rather than keep
  // loading as if nothing happened.
  c?.addEventListener?.("change", onChange);
  return () => c?.removeEventListener?.("change", onChange);
}

/** isSlowConnection, as a hook that re-renders when the connection changes. */
export function useSlowConnection(): boolean {
  return useSyncExternalStore(subscribe, isSlowConnection, () => false);
}
