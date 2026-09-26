import type { CollectionCoverItem } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animeHref, imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A collection's cover: its anime as a cover-flow. The one in the middle
 * faces you; the rest fan out behind it to either side, turned and smaller.
 * The wheel, the arrows, the keyboard or a swipe move through them; a click
 * on a side one brings it to the front, a click on the front one opens it.
 *
 * Only transforms and opacity change — the whole thing runs on the
 * compositor — and the backdrop is the front poster blurred once, not an
 * animated layer.
 */
export function CoverFlow({
  items,
  size = "lg",
  className,
}: {
  items: CollectionCoverItem[];
  size?: "lg" | "sm";
  className?: string;
}) {
  const [index, setIndex] = useState(Math.min(Math.floor(items.length / 2), items.length - 1));
  const ref = useRef<HTMLDivElement>(null);
  const wheelLock = useRef(0);
  const touchX = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback(
    (dir: number) => setIndex((i) => Math.min(count - 1, Math.max(0, i + dir))),
    [count],
  );

  // The wheel moves one poster per notch, not one per pixel of a trackpad.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 4) return;
      const now = Date.now();
      const atEdge = (delta < 0 && index === 0) || (delta > 0 && index === count - 1);
      if (atEdge) return; // let the page scroll on
      e.preventDefault();
      if (now - wheelLock.current < 260) return;
      wheelLock.current = now;
      go(delta > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [go, index, count]);

  if (count === 0) return null;
  const front = items[index]!;
  const lg = size === "lg";

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start != null && end != null && Math.abs(end - start) > 40) go(end < start ? 1 : -1);
        touchX.current = null;
      }}
      className={cn(
        "relative isolate overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        lg ? "h-[19rem] sm:h-[24rem]" : "h-44",
        className,
      )}
      style={{ perspective: "1200px" }}
    >
      {/* The front poster, blurred, as the backdrop — drawn once per change. */}
      {front.image && (
        <img
          key={front.id}
          aria-hidden
          src={imageSrc(front.image)}
          alt=""
          className="absolute inset-0 -z-10 size-full scale-125 animate-in object-cover opacity-30 blur-2xl fade-in-0 duration-500"
        />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/40 to-background" />

      {items.map((item, i) => {
        const offset = i - index;
        const abs = Math.abs(offset);
        if (abs > 4) return null;
        const isFront = offset === 0;
        const card = (
          <span
            className={cn(
              "block aspect-[2/3] overflow-hidden rounded-xl border bg-card shadow-2xl",
              isFront ? "border-primary/60 shadow-primary/30" : "border-white/10 shadow-black/60",
            )}
          >
            {item.image ? (
              <img src={imageSrc(item.image)} alt="" loading={abs > 2 ? "lazy" : "eager"} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center p-2 text-center text-xs text-muted-foreground">{item.title}</span>
            )}
          </span>
        );
        return (
          <div
            key={item.id}
            className={cn(
              "absolute left-1/2 top-1/2 transition-[transform,opacity] duration-500 ease-out",
              lg ? "w-36 sm:w-44" : "w-24",
            )}
            style={{
              transform: `translate(-50%, -50%) translateX(${offset * (lg ? 62 : 58)}%) translateZ(${-abs * 120}px) rotateY(${offset * -32}deg)`,
              zIndex: 20 - abs,
              opacity: abs > 3 ? 0 : 1 - abs * 0.18,
            }}
          >
            {isFront ? (
              <Link to={animeHref(item)} viewTransition title={item.title} className="block">
                {card}
              </Link>
            ) : (
              <button type="button" onClick={() => setIndex(i)} title={item.title} className="block w-full">
                {card}
              </button>
            )}
          </div>
        );
      })}

      {/* What the front one is, under it. */}
      <p className={cn("absolute inset-x-0 z-30 truncate px-16 text-center font-semibold drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]", lg ? "bottom-3 text-sm" : "bottom-1 text-[11px]")}>
        {front.title}
      </p>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="←"
            className="absolute left-2 top-1/2 z-30 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-primary/30 bg-background/90 text-foreground shadow-lg transition-all hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === count - 1}
            aria-label="→"
            className="absolute right-2 top-1/2 z-30 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-primary/30 bg-background/90 text-foreground shadow-lg transition-all hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}
