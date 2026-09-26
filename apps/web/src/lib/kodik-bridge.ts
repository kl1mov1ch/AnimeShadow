import { useEffect, useRef } from "react";

/**
 * Kodik's player API for sites that embed it: the player posts its state to
 * the embedding page (`kodik_player_*` messages) and takes commands back
 * (`kodik_player_api`). It is the provider's own documented interface —
 * nothing here reaches inside the frame.
 *
 * Only messages from the one iframe we pass in are believed: the check is on
 * `event.source`, the frame's own window, not on anything the message says.
 */
export interface KodikHandlers {
  /** Current position, in seconds, roughly once a second while playing. */
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  onStarted?: () => void;
  /** The frame moved to another episode by itself. */
  onEpisode?: (episode: number) => void;
}

export function isKodikUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)(kodik|aniqit)/i.test(new URL(url, "https://x").hostname);
  } catch {
    return false;
  }
}

export function useKodikBridge(frame: HTMLIFrameElement | null, handlers: KodikHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { key?: unknown; value?: unknown } | null;
      if (!data || typeof data !== "object" || typeof data.key !== "string") return;
      const h = ref.current;
      switch (data.key) {
        case "kodik_player_time_update":
          if (typeof data.value === "number") h.onTime?.(data.value);
          break;
        case "kodik_player_duration_update":
          if (typeof data.value === "number") h.onDuration?.(data.value);
          break;
        case "kodik_player_video_ended":
          h.onEnded?.();
          break;
        case "kodik_player_video_started":
          h.onStarted?.();
          break;
        case "kodik_player_current_episode": {
          const value = data.value as { episode?: unknown } | null;
          const n = Number(value?.episode);
          if (Number.isInteger(n) && n > 0) h.onEpisode?.(n);
          break;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frame]);

  return {
    seek: (seconds: number) =>
      frame?.contentWindow?.postMessage({ key: "kodik_player_api", value: { method: "seek", seconds: Math.max(0, Math.round(seconds)) } }, "*"),
    play: () => frame?.contentWindow?.postMessage({ key: "kodik_player_api", value: { method: "play" } }, "*"),
  };
}
