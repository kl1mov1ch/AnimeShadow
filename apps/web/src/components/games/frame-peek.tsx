import { useRef } from "react";
import { cn } from "@/lib/utils";

/** A clear patch follows the pointer; the rest of the frame stays blurred. */
export function FramePeek({
  src,
  revealed,
  loaded,
  onLoad,
  onError,
}: {
  src: string | undefined;
  revealed: boolean;
  loaded: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const move = (x: number, y: number) => {
    const el = surface.current;
    if (!el || revealed) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--peek-x", `${x - rect.left}px`);
    el.style.setProperty("--peek-y", `${y - rect.top}px`);
    el.dataset.peeking = "true";
  };
  const leave = () => {
    if (surface.current) surface.current.dataset.peeking = "false";
  };
  return (
    <div
      ref={surface}
      className={cn(
        "frame-peek absolute inset-0 transition-opacity",
        loaded ? "opacity-100" : "opacity-0",
      )}
      data-revealed={revealed}
      tabIndex={revealed ? -1 : 0}
      role="img"
      aria-label="Кадр аниме. Наведи курсор или удерживай палец, чтобы подсмотреть. С клавиатуры — нажми пробел."
      onPointerMove={(e) => {
        if (e.pointerType !== "touch" || e.buttons) move(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => move(e.clientX, e.clientY)}
      onPointerLeave={leave}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") leave();
      }}
      onBlur={leave}
      onKeyDown={(e) => {
        if (e.code === "Space") {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          move(r.left + r.width / 2, r.top + r.height / 2);
        }
      }}
      onKeyUp={(e) => {
        if (e.code === "Space") leave();
      }}
    >
      <img
        src={src}
        alt=""
        decoding="async"
        className="absolute inset-0 size-full scale-105 object-cover"
        onLoad={onLoad}
        onError={onError}
      />
      {!revealed && (
        <div className="frame-peek-blur pointer-events-none absolute inset-0">
          <img
            src={src}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-105 object-cover blur-[5px]"
          />
        </div>
      )}
      {!revealed && (
        <span
          aria-hidden
          className="frame-peek-ring pointer-events-none absolute size-24 rounded-full border border-white/40 shadow-[0_0_0_1px_#0004]"
        />
      )}
    </div>
  );
}
