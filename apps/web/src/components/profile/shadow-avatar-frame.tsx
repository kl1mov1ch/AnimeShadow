import {
  useEffect,
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

// Cut only the free cloth tip, beyond the circular rim. Both layers share
// one cached image, so there is no second asset or animated-image download.
const CLOTH_CLIP = "polygon(84% 78%, 100% 78%, 100% 100%, 68% 100%, 82% 89%)";
const BODY_MASK = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><polygon points="84,78 100,78 100,100 68,100 82,89" fill="black"/></svg>')}")`;

/** The painted rim stays still; only small light layers move. */
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
  const splitCloth = "ribbon" in definition && animated && actualSize >= 72;
  return (
    <span
      ref={rootRef}
      className={cn("shadow-avatar-frame", className)}
      data-frame={frame}
      data-playing={animated && playing}
      data-motion={"motion" in definition ? definition.motion : "light"}
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
      {splitCloth && (
        <span className="shadow-avatar-frame__ribbon" aria-hidden>
          <img
            src={asset}
            alt=""
            draggable={false}
            decoding="async"
            style={{ clipPath: CLOTH_CLIP }}
          />
        </span>
      )}
      <img
        className="shadow-avatar-frame__art"
        src={asset}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        style={
          splitCloth
            ? {
                maskImage: BODY_MASK,
                maskMode: "luminance",
                maskSize: "100% 100%",
                maskRepeat: "no-repeat",
              }
            : undefined
        }
      />
      {animated && actualSize >= 72 && (
        <span className="shadow-avatar-frame__lights" aria-hidden>
          <span className="shadow-avatar-frame__mask">
            <span className="shadow-avatar-frame__shine" />
          </span>
          <span className="shadow-avatar-frame__spark shadow-avatar-frame__spark--one" />
          <span className="shadow-avatar-frame__spark shadow-avatar-frame__spark--two" />
          <span className="shadow-avatar-frame__spark shadow-avatar-frame__spark--three" />
        </span>
      )}
      {frame === "shadow-pro" && (
        <span className="shadow-avatar-frame__logo" aria-hidden>
          <LogoGlyph className="size-full" />
        </span>
      )}
    </span>
  );
}
