import { useEffect, useState } from "react";

export interface ScrollDirection {
  /** The page is being scrolled down (towards more content). */
  down: boolean;
  /** Still near the top of the page, where everything stays on screen. */
  nearTop: boolean;
}

/**
 * Which way the page is moving — for bars that step aside while someone
 * reads down a list and come back the moment they scroll up. Changes state
 * only when the direction flips (after a few pixels of the same movement),
 * never on every scroll event.
 */
export function useScrollDirection(topZone = 96): ScrollDirection {
  const [state, setState] = useState<ScrollDirection>({ down: false, nearTop: true });
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      const nearTop = y < topZone;
      const delta = y - last;
      if (!nearTop && Math.abs(delta) < 8) return;
      last = y;
      const down = !nearTop && delta > 0;
      setState((prev) => (prev.down === down && prev.nearTop === nearTop ? prev : { down, nearTop }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [topZone]);
  return state;
}
