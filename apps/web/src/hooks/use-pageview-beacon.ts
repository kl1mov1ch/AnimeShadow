import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { getFirstTouchReferrer, getVisitorId } from "@/lib/visitor";

/**
 * Reports one pageview per route change to POST /analytics/pageview —
 * fire-and-forget, never blocks or throws into the app. Mounted once in
 * AppShell so every route gets covered without each page having to
 * remember to call it.
 */
export function usePageviewBeacon(): void {
  const { pathname } = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    apiRequest("/analytics/pageview", {
      method: "POST",
      body: {
        path: pathname,
        referrer: getFirstTouchReferrer() || undefined,
        visitorId: getVisitorId(),
      },
    }).catch(() => undefined);
  }, [pathname]);
}
