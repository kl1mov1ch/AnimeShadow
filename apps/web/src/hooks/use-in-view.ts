import { useEffect, useRef, useState } from "react";

/**
 * True once the element has come near the screen, and true from then on —
 * for blocks that should only load their data when someone scrolls to them.
 */
export function useInView<T extends Element>(margin = "300px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin, seen]);
  return [ref, seen];
}
