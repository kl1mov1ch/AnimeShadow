import { useEffect, useRef } from "react";

/** One observer per page; blocks animate once and stay readable without JS. */
export function useStudioMotion(contentVersion: string) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const blocks = [
      ...page.querySelectorAll<HTMLElement>(
        ".hk-catalog, .hk-team-row, .hk-about-section, .hk-between, .hk-endnote",
      ),
    ];
    const hero = page.querySelector<HTMLElement>(".hk-hero");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) {
            hero.dataset.hkVisible = String(entry.isIntersecting);
            continue;
          }
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.dataset.hkSeen = "true";
          element.classList.remove("hk-reveal-waiting");
          element.classList.add("hk-reveal-playing");
          observer.unobserve(element);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -24px 0px" },
    );
    if (hero) observer.observe(hero);
    for (const block of blocks) {
      if (block.dataset.hkSeen) continue;
      if (block.getBoundingClientRect().top < window.innerHeight - 24) {
        block.dataset.hkSeen = "true";
        continue;
      }
      block.classList.add("hk-reveal-waiting");
      observer.observe(block);
    }
    const finish = (event: AnimationEvent) => {
      if (
        event.animationName === "hk-block-reveal" &&
        event.target instanceof HTMLElement
      )
        event.target.classList.remove("hk-reveal-playing");
    };
    const restore = () => {
      observer.disconnect();
      if (hero) delete hero.dataset.hkVisible;
      for (const block of blocks)
        block.classList.remove("hk-reveal-waiting", "hk-reveal-playing");
    };
    page.addEventListener("animationend", finish);
    preference.addEventListener?.("change", restore);
    return () => {
      restore();
      page.removeEventListener("animationend", finish);
      preference.removeEventListener?.("change", restore);
    };
  }, [contentVersion]);
  return root;
}
