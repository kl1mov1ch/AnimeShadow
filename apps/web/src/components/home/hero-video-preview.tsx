import type { HeroClips } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { allowHeroPreview, type DirectPreview } from "@/lib/hero-preview";

export function HeroVideoPreview({ animeId, visible, onPlayingChange }: { animeId: number; visible: boolean; onPlayingChange: (value: boolean) => void }) {
  const [settled, setSettled] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  const failed = useCallback(() => setLocalFailed(true), []);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!visible || !allowHeroPreview(connection)) { setSettled(false); return; }
    const timer = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(timer);
  }, [visible]);
  const { data, isSuccess } = useQuery({
    queryKey: ["hero-clips"], staleTime: 5 * 60_000, enabled: settled && visible,
    queryFn: ({ signal }) => apiRequest<HeroClips>("/hero-clips", { signal }),
  });
  const clips = data?.[animeId];
  const { data: external } = useQuery({
    queryKey: ["direct-preview", animeId], staleTime: 10 * 60_000,
    enabled: settled && visible && isSuccess && (!clips || localFailed),
    queryFn: ({ signal }) => apiRequest<{ preview: DirectPreview | null }>(`/anime/${animeId}/preview`, { signal }), retry: false,
  });
  const local = clips && !localFailed ? window.innerWidth <= 768 ? clips.sd : clips.hd : null;
  const url = local ?? external?.preview?.url;
  if (!settled || !visible || !url) return null;
  return <PreviewClip key={url} url={url} onPlayingChange={onPlayingChange} onFailure={local ? failed : undefined} />;
}

/** One active video; stalled playback reveals the already loaded image underneath. */
function PreviewClip({ url, onPlayingChange, onFailure }: { url: string; onPlayingChange: (value: boolean) => void; onFailure?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let alive = true;
    let done = false;
    let stall: ReturnType<typeof setTimeout>;
    const fail = () => { if (alive) { setFailed(true); setPlaying(false); onFailure?.(); video.pause(); video.removeAttribute("src"); video.load(); } };
    const arm = () => { clearTimeout(stall); stall = setTimeout(fail, 5000); };
    const started = () => { clearTimeout(stall); if (alive) setPlaying(true); };
    const ready = () => { if (!done) void video.play().catch(fail); };
    const time = () => { if (video.currentTime >= 8) { done = true; setPlaying(false); video.pause(); video.removeAttribute("src"); video.load(); } };
    video.addEventListener("canplay", ready);
    video.addEventListener("playing", started);
    video.addEventListener("waiting", arm);
    video.addEventListener("error", fail);
    video.addEventListener("timeupdate", time);
    // Restore on every setup, including React Strict Mode's setup/cleanup/setup.
    video.muted = true;
    video.src = url.startsWith("/") ? `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}${url}` : url;
    video.load(); arm();
    return () => {
      alive = false; clearTimeout(stall);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("playing", started);
      video.removeEventListener("waiting", arm);
      video.removeEventListener("error", fail);
      video.removeEventListener("timeupdate", time);
      video.pause(); video.removeAttribute("src"); video.load();
    };
  }, [url, onFailure]);
  useEffect(() => {
    onPlayingChange(playing && !failed);
    return () => onPlayingChange(false);
  }, [playing, failed, onPlayingChange]);
  return <video ref={ref} aria-hidden muted playsInline preload="auto" disablePictureInPicture
    className={`pointer-events-none absolute inset-0 z-10 size-full object-cover transition-opacity duration-500 ${playing && !failed ? "opacity-100" : "opacity-0"}`} />;
}
