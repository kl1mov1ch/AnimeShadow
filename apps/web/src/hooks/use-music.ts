import { useSyncExternalStore } from "react";
import { musicSession } from "@/lib/music-session";

export function useMusic() {
  return useSyncExternalStore(
    musicSession.subscribe,
    musicSession.getSnapshot,
    musicSession.getSnapshot,
  );
}
