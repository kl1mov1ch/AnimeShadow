import { useEffect } from "react";

/**
 * Closes an open panel on a press anywhere outside `root`, or on Escape.
 * Listens on the document `root` belongs to, so it also works in the
 * picture-in-picture window.
 */
export function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const doc = root.current?.ownerDocument ?? document;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    doc.addEventListener("pointerdown", onDown);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("pointerdown", onDown);
      doc.removeEventListener("keydown", onKey);
    };
  }, [open, close, root]);
}
