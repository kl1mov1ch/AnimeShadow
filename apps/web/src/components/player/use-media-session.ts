import { useEffect, type RefObject } from "react";

/** Headset keys and the phone's lock screen control only the visible player. */
export function useMediaSession(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, title: string) {
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const actions: MediaSessionAction[] = [];
    const bind = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try { session.setActionHandler(action, handler); actions.push(action); } catch { /* unsupported action */ }
    };
    if (typeof MediaMetadata !== "undefined") session.metadata = new MediaMetadata({ title, artist: "AnimeShadow" });
    const seek = (time: number) => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      video.currentTime = Math.max(0, Math.min(time, video.duration));
    };
    bind("play", () => { void video.play().catch(() => undefined); });
    bind("pause", () => video.pause());
    bind("seekbackward", ({ seekOffset }) => seek(video.currentTime - (seekOffset ?? 10)));
    bind("seekforward", ({ seekOffset }) => seek(video.currentTime + (seekOffset ?? 10)));
    bind("seekto", ({ seekTime }) => { if (seekTime != null) seek(seekTime); });
    const update = () => {
      session.playbackState = video.paused ? "paused" : "playing";
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      try {
        session.setPositionState?.({ duration: video.duration, position: Math.min(video.currentTime, video.duration), playbackRate: video.playbackRate });
      } catch { /* platform does not support position state */ }
    };
    const events = ["play", "pause", "timeupdate", "durationchange", "ratechange"];
    events.forEach((event) => video.addEventListener(event, update));
    update();
    return () => {
      events.forEach((event) => video.removeEventListener(event, update));
      actions.forEach((action) => session.setActionHandler(action, null));
      session.playbackState = "none";
      session.metadata = null;
      try { session.setPositionState?.(); } catch { /* unsupported */ }
    };
  }, [videoRef, active, title]);
}
