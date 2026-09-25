import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Mounts its children — and so starts their requests — only once the spot
 * they'd occupy comes within `margin` of the screen. Until then it holds
 * the place with an empty box of `minHeight`, so the page doesn't jump.
 *
 * A title page used to fire characters, franchise, similar titles and the
 * comment thread the moment it opened, whether or not anyone scrolled that
 * far. Most visits never do.
 */
export function WhenNear({
  children,
  minHeight = 280,
  margin = 800,
}: {
  children: ReactNode;
  minHeight?: number;
  /** How far below the screen (px) to start, so it's ready on arrival. */
  margin?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${margin}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, margin]);

  // A link straight to a section further down (#comments) must still land.
  useEffect(() => {
    if (!near && window.location.hash) setNear(true);
  }, [near]);

  return near ? <>{children}</> : <div ref={ref} aria-hidden style={{ minHeight }} />;
}
