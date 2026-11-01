import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { shadowFrame } from "@/lib/avatar-frames";
import { cn } from "@/lib/utils";
import "./shadow-avatar-frame.css";

/** Whole artwork and whole silk layers: nothing is cut out of the painted rim. */
export function ShadowAvatarFrame({
  frame,
  children,
  animated = false,
  className,
  size,
}: {
  frame: string;
  children: ReactNode;
  animated?: boolean;
  className?: string;
  /** Avatar diameter, excluding the reserved rim. Auto-measured when omitted. */
  size?: number;
}) {
  const definition = shadowFrame(frame);
  const faceRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const [diameter, setDiameter] = useState(size ?? 40);
  const [playing, setPlaying] = useState(false);
  const silkId = useId();
  useLayoutEffect(() => {
    if (size != null) return;
    const face = faceRef.current;
    if (!face) return;
    const measure = () => setDiameter(face.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(face);
    return () => observer.disconnect();
  }, [size]);
  const actualSize = size ?? diameter;
  useEffect(() => {
    if (!animated || actualSize < 72) return;
    const element = rootRef.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setPlaying(visible && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, [animated, actualSize]);
  if (!definition) return <>{children}</>;
  const asset =
    actualSize <= 64
      ? definition.asset.replace(".webp", "-thumb.webp")
      : definition.asset;
  const motion =
    "motion" in definition
      ? definition.motion
      : frame === "shadow-standard"
        ? "petal"
        : "star";
  return (
    <span
      ref={rootRef}
      className={cn("shadow-avatar-frame", className)}
      data-frame={frame}
      data-playing={animated && playing}
      data-motion={motion}
      style={
        {
          "--frame-pad": `${actualSize * 0.21}px`,
          "--frame-accent": definition.accent,
          "--frame-mask": `url("${asset}")`,
        } as CSSProperties
      }
    >
      <span ref={faceRef} className="shadow-avatar-frame__face">
        {children}
      </span>
      {"ribbon" in definition && (
        <span
          className="shadow-avatar-frame__silk"
          aria-hidden
          style={{ color: definition.ribbon }}
        >
          <span className="shadow-avatar-frame__strand shadow-avatar-frame__strand--back shadow-avatar-frame__animated">
            <svg viewBox="0 0 64 100" fill="none">
              <defs>
                <linearGradient
                  id={`${silkId}-back`}
                  x1="8"
                  y1="0"
                  x2="48"
                  y2="98"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="currentColor" />
                  <stop offset="1" stopColor="#24202d" />
                </linearGradient>
              </defs>
              <path
                d="M5 4C24 3 40 15 35 36C29 60 42 76 55 89L42 88L33 98C16 80 13 62 20 40C25 24 14 17 5 4Z"
                fill={`url(#${silkId}-back)`}
              />
            </svg>
          </span>
          <span className="shadow-avatar-frame__strand shadow-avatar-frame__strand--front shadow-avatar-frame__animated">
            <svg viewBox="0 0 64 100" fill="none">
              <defs>
                <linearGradient
                  id={`${silkId}-front`}
                  x1="3"
                  y1="10"
                  x2="58"
                  y2="85"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#f6e2da" />
                  <stop offset=".18" stopColor="currentColor" />
                  <stop offset=".6" stopColor="currentColor" />
                  <stop offset="1" stopColor="#25212c" />
                </linearGradient>
              </defs>
              <path
                d="M4 4C28 2 27 21 24 37C21 54 34 64 55 70L46 79L48 91C17 82 9 63 13 43C17 24 15 13 4 4Z"
                fill={`url(#${silkId}-front)`}
              />
              <path
                d="M8 8C20 16 20 29 18 42C14 65 27 77 43 83"
                stroke="var(--frame-accent)"
                strokeWidth="1.3"
                opacity=".65"
              />
            </svg>
          </span>
        </span>
      )}
      <img
        className="shadow-avatar-frame__art"
        src={asset}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
      />
      {animated && actualSize >= 72 && (
        <span className="shadow-avatar-frame__lights" aria-hidden>
          <span className="shadow-avatar-frame__mask">
            <span className="shadow-avatar-frame__glow shadow-avatar-frame__animated" />
            <span className="shadow-avatar-frame__shine shadow-avatar-frame__animated" />
            {motion === "lantern" && (
              <span className="shadow-avatar-frame__lantern shadow-avatar-frame__animated" />
            )}
          </span>
          <span className="shadow-avatar-frame__orbit shadow-avatar-frame__animated">
            <svg viewBox="0 0 100 100" fill="none">
              <circle
                cx="50"
                cy="50"
                r="43.8"
                pathLength="100"
                stroke="currentColor"
                strokeWidth=".7"
                strokeDasharray="11 38 3 48"
                strokeLinecap="round"
              />
            </svg>
          </span>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`shadow-avatar-frame__mote shadow-avatar-frame__mote--${index} shadow-avatar-frame__animated`}
            >
              <FrameMotif motion={motion} />
            </span>
          ))}
        </span>
      )}
      {frame === "shadow-pro" && (
        <span
          className="shadow-avatar-frame__logo shadow-avatar-frame__animated"
          aria-hidden
        >
          <LogoGlyph className="size-full" />
        </span>
      )}
    </span>
  );
}

function FrameMotif({ motion }: { motion: string }) {
  let shape: ReactNode;
  if (motion === "witch") {
    shape = (
      <path d="M2 8L8 10L10 6L12 9L14 6L16 10L22 8L19 16L15 14L12 18L9 14L5 16Z" />
    );
  } else if (motion === "scout" || motion === "feather") {
    shape = (
      <>
        <path d="M20 3C7 1 2 11 5 17C10 23 21 16 20 3Z" opacity=".75" />
        <path
          d="M4 22L17 6M9 16L8 10M12 13L18 12"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
        />
      </>
    );
  } else if (motion === "grimoire") {
    shape = (
      <>
        <path d="M12 12C-1 9 5 0 11 5C14-4 24 5 16 11C26 15 16 25 12 17C5 26-3 15 7 12Z" />
        <path d="M12 13L13 23" stroke="currentColor" strokeWidth="1.5" />
      </>
    );
  } else if (motion === "voyage" || motion === "water") {
    shape = (
      <path
        d="M2 15C7 8 10 20 15 12C19 5 10 2 9 8M3 20C8 15 14 23 21 16"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    );
  } else if (motion === "chakra" || motion === "seal") {
    shape = (
      <path
        d="M12 2C25 3 25 22 12 22C2 22 0 8 9 6C18 3 21 16 13 17C7 18 7 10 12 10"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    );
  } else if (motion === "ember" || motion === "lantern" || motion === "chain") {
    shape = (
      <path d="M13 1C17 10 23 10 20 18C18 25 6 25 4 17C2 12 7 8 8 5C8 11 11 12 13 1Z" />
    );
  } else if (motion === "petal") {
    shape = <path d="M4 3C18 0 25 12 17 20C9 26 0 15 4 3Z" />;
  } else {
    shape = <path d="M12 1L15 9L23 12L15 15L12 23L9 15L1 12L9 9Z" />;
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      {shape}
    </svg>
  );
}
