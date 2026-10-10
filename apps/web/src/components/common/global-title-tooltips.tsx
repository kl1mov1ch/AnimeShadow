import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TIP_SURFACE, TIP_TEXT } from "@/lib/tip-style";
import { cn } from "@/lib/utils";

/** How long a pointer rests before the first hint appears — long enough
 *  not to flash hints while the pointer is just crossing the page. */
const SHOW_DELAY_MS = 300;
/** Once a hint has been up, the next one within this window appears at
 *  once and glides over from the last, instead of fading out and in. */
const SKIP_WINDOW_MS = 450;
/** The fade-out. */
const HIDE_MS = 140;
const GAP = 6;
const EDGE = 8;

interface Tip {
  text: string;
  rect: DOMRect;
  /** Taking over from a hint that is still on screen: move, don't re-appear. */
  glide: boolean;
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
 * It moves like one object: placed before it is shown (no jump from a
 * corner), fading in with a small rise, gliding between neighbours — along
 * a row of buttons or down the episode list — rather than blinking out and
 * back in at every element, and fading out when the pointer leaves.
 *
 * Iframes keep their `title` — there it is the frame's accessible name,
 * not a hint — and an element whose only name was its title gets it as
 * `aria-label` before the title is taken away, so nothing loses its label.
 */
export function GlobalTitleTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  const current = useRef<HTMLElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClosedAt = useRef(0);

  useEffect(() => {
    const stopTimers = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showTimer.current = null;
      hideTimer.current = null;
    };

    const close = (instant: boolean) => {
      stopTimers();
      current.current = null;
      if (!openRef.current) {
        setTip(null);
        return;
      }
      setOpen(false);
      lastClosedAt.current = Date.now();
      hideTimer.current = setTimeout(() => setTip(null), instant ? 0 : HIDE_MS);
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
      stopTimers();
      const warm = openRef.current || Date.now() - lastClosedAt.current < SKIP_WINDOW_MS;
      const show = () => {
        if (current.current !== el || !el.isConnected) return;
        setTip({ text, rect: el.getBoundingClientRect(), glide: openRef.current });
        setOpen(true);
      };
      if (warm || event.type === "focusin") show();
      else showTimer.current = setTimeout(show, SHOW_DELAY_MS);
    };

    const leave = (event: Event) => {
      const el = current.current;
      if (!el) return;
      const next = (event as PointerEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && el.contains(next)) return;
      // If the pointer went straight onto another element with a hint, its
      // `enter` comes right after this and takes the bubble over.
      close(false);
    };

    const dismiss = () => close(true);

    document.addEventListener("pointerover", enter, true);
    document.addEventListener("focusin", enter, true);
    document.addEventListener("pointerout", leave, true);
    document.addEventListener("focusout", leave, true);
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerover", enter, true);
      document.removeEventListener("focusin", enter, true);
      document.removeEventListener("pointerout", leave, true);
      document.removeEventListener("focusout", leave, true);
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("blur", dismiss);
      stopTimers();
    };
  }, []);

  if (!tip) return null;
  return createPortal(<TipBubble tip={tip} open={open} />, document.body);
}

function TipBubble({ tip, open }: { tip: Tip; open: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  // The first frame is drawn already in place but transparent; only then
  // does it fade in — that is what keeps it from flashing somewhere else.
  const [settled, setSettled] = useState(false);

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

  useEffect(() => {
    if (!pos || settled) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [pos, settled]);

  const visible = open && settled && pos != null;
  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
      className={cn(
        "pointer-events-none fixed z-[100] will-change-[opacity,transform]",
        TIP_SURFACE,
        TIP_TEXT,
        !pos && "invisible",
        // Gliding to the next element moves the bubble itself; otherwise
        // only its opacity and lift animate.
        settled && tip.glide
          ? "transition-[opacity,transform,left,top] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          : "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible ? "translate-y-0 opacity-100" : cn("opacity-0", pos?.below ? "-translate-y-1" : "translate-y-1"),
      )}
    >
      {tip.text}
    </div>
  );
}
