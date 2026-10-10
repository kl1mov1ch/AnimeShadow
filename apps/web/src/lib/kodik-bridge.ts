import { useEffect, useRef } from "react";

/**
 * Kodik's player API for sites that embed it: the player posts its state to
 * the embedding page (`kodik_player_*` messages) and takes commands back
 * (`kodik_player_api`). It is the provider's own interface — nothing here
 * reaches inside the frame, and nothing here touches its ads.
 *
 * What the player actually implements (read off its own message handler):
 * commands `play`, `pause`, `seek {seconds}`, `volume {volume: 0…1}`,
 * `speed {speed: 0.25…2}`, `mute`, `unmute`, `enter_pip`, `exit_pip`,
 * `get_time`, `change_episode {episode, season?, without_reload?}`; events
 * `time_update` (whole seconds, only while moving forward), `duration_update`,
 * `video_started`, `video_ended`, `play`, `pause`, `seek`, `volume_change`,
 * `speed_change`, `current_episode`, `skip_button`, `enter_pip`, `exit_pip`,
 * `advert_ended`, and `time` (the answer to `get_time`). There is no quality
 * command: quality stays in the player's own menu.
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
  /** A seek finished — at this position, when the player says. */
  onSeek?: (seconds: number | null) => void;
  onMuted?: (muted: boolean) => void;
  /** 0…1 */
  onVolume?: (volume: number) => void;
  onSpeed?: (speed: number) => void;
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
  /** 0…1 */
  volume: (volume: number) => void;
  /** 0.25…2 — the range the player accepts. */
  speed: (speed: number) => void;
}

const numberOf = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

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
      switch (data.key) {
        case "kodik_player_time_update":
        case "kodik_player_time": {
          const n = numberOf(data.value);
          if (n != null) h.onTime?.(n);
          break;
        }
        case "kodik_player_duration_update": {
          const n = numberOf(data.value);
          if (n != null) h.onDuration?.(n);
          break;
        }
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
        case "kodik_player_seek": {
          const value = data.value as { time?: unknown } | number | null;
          h.onSeek?.(numberOf(typeof value === "object" && value ? value.time : value));
          break;
        }
        case "kodik_player_speed_change": {
          const n = numberOf(data.value);
          if (n != null && n > 0) h.onSpeed?.(n);
          break;
        }
        case "kodik_player_volume_change": {
          // An object ({ volume, muted }) or, from some builds, the bare level.
          const value = data.value as { muted?: unknown; volume?: unknown } | number | null;
          if (typeof value === "number") {
            h.onVolume?.(value);
          } else if (value && typeof value === "object") {
            if (typeof value.muted === "boolean") h.onMuted?.(value.muted);
            const level = numberOf(value.volume);
            if (level != null) h.onVolume?.(level);
          }
          break;
        }
        case "kodik_player_current_episode": {
          const value = data.value as { episode?: unknown } | null;
          const n = Number(value?.episode);
          if (Number.isInteger(n) && n > 0) h.onEpisode?.(n);
          break;
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
    volume: (volume) => send({ method: "volume", volume: Math.min(1, Math.max(0, volume)) }),
    speed: (speed) => send({ method: "speed", speed: Math.min(2, Math.max(0.25, speed)) }),
  };
}
