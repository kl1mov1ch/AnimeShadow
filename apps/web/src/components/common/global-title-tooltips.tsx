import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** How long a pointer rests before the hint appears — long enough not to flicker while crossing a row. */
const SHOW_DELAY_MS = 280;
const GAP = 8;
const EDGE = 8;

interface Tip {
  text: string;
  rect: DOMRect;
}

/**
 * Every plain `title` on the site, shown as the site's own tooltip.
 *
 * A native `title` hint is drawn by the browser — grey, system font, a
 * second's delay, no way to style it — and there were dozens of them on
 * icons and chips across every page, each one breaking the look the
 * moment it appeared. Rather than rewrite every one (and every one added
 * later), this watches the whole document: when the pointer or keyboard
 * focus reaches an element with a `title`, the text moves to `data-tip`
 * (so the browser's own hint never shows), and this draws it instead.
 *
 * Iframes keep their `title` — there it is the frame's accessible name,
 * not a hint — and an element whose only name was its title gets it as
 * `aria-label` before the title is taken away, so nothing loses its label.
 */
export function GlobalTitleTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setTip(null);
    };

    const enter = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[title], [data-tip]");
      if (!el || el.tagName === "IFRAME" || !(el instanceof HTMLElement)) return;

      const native = el.getAttribute("title");
      if (native) {
        el.setAttribute("data-tip", native);
        el.removeAttribute("title");
        if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) {
          el.setAttribute("aria-label", native);
        }
      }
      const text = el.getAttribute("data-tip");
      if (!text || current.current === el) return;

      current.current = el;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          if (current.current === el && el.isConnected) {
            setTip({ text, rect: el.getBoundingClientRect() });
          }
        },
        event.type === "focusin" ? 0 : SHOW_DELAY_MS,
      );
    };

    const leave = (event: Event) => {
      const el = current.current;
      if (!el) return;
      const next = (event as PointerEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && el.contains(next)) return;
      clear();
    };

    document.addEventListener("pointerover", enter, true);
    document.addEventListener("focusin", enter, true);
    document.addEventListener("pointerout", leave, true);
    document.addEventListener("focusout", leave, true);
    document.addEventListener("pointerdown", clear, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", enter, true);
      document.removeEventListener("focusin", enter, true);
      document.removeEventListener("pointerout", leave, true);
      document.removeEventListener("focusout", leave, true);
      document.removeEventListener("pointerdown", clear, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!tip) return null;
  return createPortal(<TipBubble tip={tip} />, document.body);
}

function TipBubble({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  // Above the element when there is room, below it otherwise, and never
  // past either edge of the window.
  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!bubble) return;
    const { width, height } = bubble.getBoundingClientRect();
    const below = tip.rect.top - height - GAP < EDGE;
    const top = below ? tip.rect.bottom + GAP : tip.rect.top - height - GAP;
    const centre = tip.rect.left + tip.rect.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centre), window.innerWidth - width - EDGE);
    setPos({ left, top, below });
  }, [tip]);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
      }}
      className={cn(
        "pointer-events-none fixed z-[100] max-w-[min(20rem,80vw)] rounded-lg border border-primary/35 bg-popover bg-gradient-to-b from-primary/[0.14] via-primary/[0.04] to-transparent px-3 py-2 text-[12px] font-medium leading-snug text-balance text-popover-foreground shadow-xl shadow-primary/15 ring-1 ring-black/5",
        pos && "animate-in fade-in-0 zoom-in-90 duration-150",
        pos && (pos.below ? "slide-in-from-top-1" : "slide-in-from-bottom-1"),
      )}
    >
      {tip.text}
    </div>
  );
}
