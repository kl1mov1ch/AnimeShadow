import { useEffect, useRef } from "react";

/**
 * Kodik's player API for sites that embed it: the player posts its state to
 * the embedding page (`kodik_player_*` messages) and takes commands back
 * (`kodik_player_api`). It is the provider's own documented interface —
 * nothing here reaches inside the frame, and nothing here touches its ads.
 *
 * Only messages from the one iframe we pass in are believed: the check is on
 * `event.source`, the frame's own window, not on anything the message says.
 * The listener sits on the window that holds the frame — the page itself,
 * or the picture-in-picture window when the player has been moved there.
 */
export interface KodikHandlers {
  /** Current position, in seconds, roughly once a second while playing. */
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  onStarted?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onMuted?: (muted: boolean) => void;
  /** An advert started or ended inside the player. */
  onAdvert?: (playing: boolean) => void;
  /** The frame moved to another episode by itself. */
  onEpisode?: (episode: number) => void;
  /** Any message at all from the frame: proof the API is there. */
  onAlive?: () => void;
}

export function isKodikUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)(kodik|aniqit)/i.test(new URL(url, "https://x").hostname);
  } catch {
    return false;
  }
}

export interface KodikCommands {
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  mute: () => void;
  unmute: () => void;
}

export function useKodikBridge(frame: HTMLIFrameElement | null, handlers: KodikHandlers): KodikCommands {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!frame) return;
    const host = frame.ownerDocument.defaultView;
    if (!host) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { key?: unknown; value?: unknown } | null;
      if (!data || typeof data !== "object" || typeof data.key !== "string") return;
      if (!data.key.startsWith("kodik_player")) return;
      const h = ref.current;
      h.onAlive?.();
      const key = data.key;
      switch (key) {
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
        case "kodik_player_play":
          h.onPlay?.();
          break;
        case "kodik_player_pause":
          h.onPause?.();
          break;
        case "kodik_player_volume_change": {
          const value = data.value as { muted?: unknown; volume?: unknown } | null;
          if (value && typeof value.muted === "boolean") h.onMuted?.(value.muted);
          break;
        }
        case "kodik_player_current_episode": {
          const value = data.value as { episode?: unknown } | null;
          const n = Number(value?.episode);
          if (Number.isInteger(n) && n > 0) h.onEpisode?.(n);
          break;
        }
        default:
          // Adverts are reported under a couple of names; read them loosely.
          if (/advert|_ad_/i.test(key)) {
            if (/start|play/i.test(key)) h.onAdvert?.(true);
            else if (/end|stop|skip|complete/i.test(key)) h.onAdvert?.(false);
          }
      }
    };
    host.addEventListener("message", onMessage);
    return () => host.removeEventListener("message", onMessage);
  }, [frame]);

  const send = (value: Record<string, unknown>) =>
    frame?.contentWindow?.postMessage({ key: "kodik_player_api", value }, "*");
  return {
    seek: (seconds) => send({ method: "seek", seconds: Math.max(0, Math.round(seconds)) }),
    play: () => send({ method: "play" }),
    pause: () => send({ method: "pause" }),
    mute: () => send({ method: "mute" }),
    unmute: () => send({ method: "unmute" }),
  };
}
