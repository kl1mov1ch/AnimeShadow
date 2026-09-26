import { useCallback, useRef } from "react";

/**
 * Scroll a list by grabbing it with the mouse, as on a phone — for lists
 * whose scrollbar is hidden. The wheel and touch keep working as usual.
 * A drag longer than a few pixels swallows the click that ends it, so
 * letting go over a row doesn't open that row.
 */
export function useDragScroll<T extends HTMLElement>() {
  const node = useRef<T | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    node.current = el;
    if (!el) return;

    let startY = 0;
    let startTop = 0;
    let dragging = false;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      startTop = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 5) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
      }
      el.scrollTop = startTop - dy;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = "";
      el.style.userSelect = "";
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    cleanup.current = () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, []);
}
