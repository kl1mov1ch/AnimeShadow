import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { logGuestSession, useLogSession } from "@/lib/query";
import { getVisitorId } from "@/lib/visitor";

/**
 * Counts elapsed wall time only while the parent reports active playback.
 * Pauses, hidden tabs and off-screen players stop counting. The API bounds
 * heartbeats and excludes overlapping tabs before awarding cosmetic time.
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
    if (!active || status === "loading") return;

    startRef.current = document.visibilityState === "hidden" ? null : Date.now();

    const flush = () => {
      const start = startRef.current;
      if (start == null) return;
      const seconds = Math.round((Date.now() - start) / 1000);
      startRef.current = document.visibilityState === "hidden" ? null : Date.now();
      if (seconds < 15) return;
      const input = {
        animeId,
        episode,
        seconds: Math.min(seconds, 86_400),
        startedAt: new Date(start).toISOString(),
      };
      if (authed) log.mutate(input);
      else
        void logGuestSession({ ...input, visitorId: getVisitorId() }).catch(
          () => undefined,
        );
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        startRef.current = null;
      } else startRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);
    const heartbeat = setInterval(flush, 60_000);

    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
      clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, status, active, animeId, episode]);
}
