import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLogSession } from "@/lib/query";

/**
 * Records a coarse viewing session while the player is mounted for a signed-in
 * user. The embed is a third-party iframe we can't read playback from, so this
 * measures "time with the player open on this page" — enough for the hours-watched
 * and average-session stats. Flushes on unmount, tab hide and page unload.
 */
export function useWatchSession({
  animeId,
  episode,
  active,
}: {
  animeId: number;
  episode: number;
  active: boolean;
}): void {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const log = useLogSession();
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authed || !active) return;

    startRef.current = Date.now();

    const flush = () => {
      const start = startRef.current;
      if (start == null) return;
      const seconds = Math.round((Date.now() - start) / 1000);
      startRef.current = Date.now(); // reset so a resume doesn't double-count
      if (seconds < 15) return;
      log.mutate({
        animeId,
        episode,
        seconds: Math.min(seconds, 86_400),
        startedAt: new Date(start).toISOString(),
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else startRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);

    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, active, animeId, episode]);
}
