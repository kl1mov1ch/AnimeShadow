import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { getFirstTouchReferrer, getUtm, getVisitorId, touchSession } from "@/lib/visitor";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/**
 * Reports one pageview per route change to POST /analytics/pageview, and,
 * when the page is left, how long it was actually on screen (hidden-tab
 * time doesn't count) to POST /analytics/leave via sendBeacon, which
 * survives the tab closing. Fire-and-forget: never blocks or throws into the
 * app. Mounted once in AppShell.
 */
export function usePageviewBeacon(): void {
  const { pathname } = useLocation();
  const lastPath = useRef<string | null>(null);
  const current = useRef<{ clientId: string; visibleMs: number; since: number | null } | null>(null);

  // Visible time on the current page: counted only while the tab is shown.
  useEffect(() => {
    const onVisibility = () => {
      const page = current.current;
      if (!page) return;
      if (document.visibilityState === "hidden") {
        if (page.since != null) page.visibleMs += Date.now() - page.since;
        page.since = null;
        sendLeave(page);
      } else {
        page.since = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    // The page being left gets its time.
    const previous = current.current;
    if (previous) {
      if (previous.since != null) previous.visibleMs += Date.now() - previous.since;
      previous.since = null;
      sendLeave(previous);
    }

    const clientId = crypto.randomUUID();
    current.current = { clientId, visibleMs: 0, since: document.visibilityState === "visible" ? Date.now() : null };
    const session = touchSession();

    apiRequest("/analytics/pageview", {
      method: "POST",
      body: {
        path: pathname,
        referrer: getFirstTouchReferrer() || undefined,
        visitorId: getVisitorId(),
        clientId,
        sessionId: session.id,
        entry: session.entry,
        sessionRef: session.referrer,
        lang: navigator.language || undefined,
        screenW: Math.round(window.innerWidth),
        ...getUtm(),
      },
    }).catch(() => undefined);
  }, [pathname]);
}

/** Sent at most once per page with a real duration; a later visibility
 *  change can't overwrite it (the server only fills an empty one). */
function sendLeave(page: { clientId: string; visibleMs: number }) {
  if (page.visibleMs < 500) return;
  const body = JSON.stringify({ clientId: page.clientId, visitorId: getVisitorId(), durationMs: Math.round(page.visibleMs) });
  const url = `${API_BASE}/api/analytics/leave`;
  try {
    if (navigator.sendBeacon?.(url, body)) return;
  } catch {
    // fall through to fetch
  }
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => undefined);
}
