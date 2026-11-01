import { useEffect, useRef } from "react";
import { watchNavigationDestination } from "@/lib/watch-navigation";

export function useWatchNavigation(playing: boolean, requestMini: () => void) {
  const latest = useRef(requestMini);
  latest.current = requestMini;
  useEffect(() => {
    if (!playing) return;
    const onLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        !watchNavigationDestination(
          anchor.href,
          window.location.href,
          anchor.getAttribute("target"),
          anchor.hasAttribute("download"),
        )
      )
        return;
      const target = anchor.getAttribute("target"),
        rel = anchor.getAttribute("rel");
      anchor.target = "_blank";
      anchor.rel = [
        ...new Set(`${rel || ""} noopener noreferrer`.split(/\s+/).filter(Boolean)),
      ].join(" ");
      // Keep the browser's trusted link action. Calling window.open after
      // awaiting PiP loses user activation and is blocked by browsers.
      event.stopImmediatePropagation();
      latest.current();
      setTimeout(() => {
        if (target == null) anchor.removeAttribute("target");
        else anchor.setAttribute("target", target);
        if (rel == null) anchor.removeAttribute("rel");
        else anchor.setAttribute("rel", rel);
      }, 0);
    };
    document.addEventListener("click", onLink, true);
    return () => document.removeEventListener("click", onLink, true);
  }, [playing]);
}
