import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A Lottie animation rendered in the site's own colour, whatever the theme is.
 *
 * Every animation shipped here is authored monochrome on purpose (see
 * lottie-animations.ts). Lottie writes its colours onto the generated SVG as
 * presentation attributes, and presentation attributes lose to any CSS rule —
 * so forcing `fill`/`stroke` to `currentColor` on the produced nodes lets one
 * animation file be ink-black in the light theme and paper-white in the dark
 * one, with nothing to keep in sync. A coloured Lottie could not do that.
 *
 * lottie-web is loaded lazily: it is a large library for what is decoration,
 * and nothing here should sit in the initial bundle.
 */
export function LottieMono({
  animation,
  className,
  loop = true,
  speed = 1,
  /** Fades in only once the first frame actually exists, so a slow chunk
   *  load leaves empty space rather than a half-drawn shape. */
  ...rest
}: {
  animation: object;
  className?: string;
  loop?: boolean;
  speed?: number;
} & Omit<React.ComponentProps<"div">, "children">) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroy: (() => void) | undefined;
    let cancelled = false;

    // Honoured at load time rather than by pausing afterwards: someone who
    // asked for no motion should never see the first loop play.
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    void import("lottie-web")
      .then(({ default: lottie }) => {
        if (cancelled || !hostRef.current) return;
        const item = lottie.loadAnimation({
          container: hostRef.current,
          renderer: "svg",
          loop,
          autoplay: !still,
          animationData: structuredClone(animation),
        });
        item.setSpeed(speed);
        if (still) item.goToAndStop(0, true);
        destroy = () => item.destroy();
      })
      .catch(() => {
        // Decoration only — a failed chunk leaves the gap it was filling.
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [animation, loop, speed]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      // The whole point: the animation inherits the surrounding text colour
      // instead of carrying its own, so it reads correctly in both themes.
      className={cn(
        "[&_svg]:size-full [&_*]:![fill:currentColor] [&_*]:![stroke:currentColor]",
        className,
      )}
      {...rest}
    />
  );
}
