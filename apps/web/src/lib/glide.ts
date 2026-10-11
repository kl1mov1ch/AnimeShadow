/**
 * Scrolls the page to an element at a pace the eye can follow — eased in
 * and out, longer for a longer way, never more than about a second — instead
 * of the jump cut an in-page link makes. The browser's own smooth scrolling
 * runs at whatever speed that browser likes (and some barely animate a long
 * way at all), so this one is ours.
 *
 * Stops the moment the reader takes over with a wheel, a touch or a key.
 * Jumps outright for anyone who asked their system for less motion.
 */
export function glideTo(element: HTMLElement, offset: number): void {
  const from = window.scrollY;
  const to = Math.max(0, element.getBoundingClientRect().top + from - offset);
  const distance = to - from;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || Math.abs(distance) < 4) {
    window.scrollTo(0, to);
    return;
  }
  const duration = Math.min(1000, 420 + Math.abs(distance) * 0.3);
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const start = performance.now();
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);

  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from + distance * ease(progress));
    if (progress < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
}
