import { type CSSProperties, useEffect, useRef } from "react";

const PETALS = Array.from({ length: 12 }, (_, i) => ({
  left: [3, 94, 9, 88, 15, 98, 6, 91, 18, 84, 1, 96][i],
  duration: 27 + (i % 5) * 4,
  delay: -i * 7.3,
  size: 9 + (i % 4) * 2,
  sway: 5 + (i % 3) * 2,
}));

/** Cached artwork plus a fixed set of compositor-only petal animations. */
export default function SiteBackground() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    el.dataset.economy = String(
      (device.hardwareConcurrency || 4) <= 4 || (device.deviceMemory ?? 8) <= 4,
    );
    el.dataset.saveData = String(device.connection?.saveData ?? false);
    const sync = () => {
      const playing = [...document.querySelectorAll("video")].some(
        (video) => !video.paused && !video.ended,
      );
      el.dataset.paused = String(document.hidden || playing);
    };
    document.documentElement.dataset.siteBackground = "cosmic";
    sync();
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("play", sync, true);
    document.addEventListener("pause", sync, true);
    document.addEventListener("ended", sync, true);
    return () => {
      delete document.documentElement.dataset.siteBackground;
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("play", sync, true);
      document.removeEventListener("pause", sync, true);
      document.removeEventListener("ended", sync, true);
    };
  }, []);
  return (
    <div ref={scene} className="site-scenery" aria-hidden>
      <div className="scenery-stars" />
      <picture className="scenery-nebula">
        <source
          media="(max-width: 767px)"
          srcSet="/background/nebula-small.webp"
          type="image/webp"
        />
        <source srcSet="/background/nebula.webp" type="image/webp" />
        <img
          src="/background/nebula.png"
          alt=""
          width="768"
          height="768"
          draggable={false}
        />
      </picture>
      <div className="scenery-moon">
        <picture>
          <source srcSet="/background/moon.webp" type="image/webp" />
          <img
            src="/background/moon.png"
            alt=""
            width="400"
            height="400"
            draggable={false}
          />
        </picture>
      </div>
      <div className="scenery-content-shade" />
      <div className="scenery-petals">
        {PETALS.map((petal, i) => (
          <span
            key={i}
            className="scenery-petal"
            style={
              {
                left: `${petal.left}%`,
                "--fall-time": `${petal.duration}s`,
                "--fall-delay": `${petal.delay}s`,
                "--sway-time": `${petal.sway}s`,
                "--petal-size": `${petal.size}px`,
              } as CSSProperties
            }
          >
            <img
              src="/background/sakura-petal.svg"
              alt=""
              width="32"
              height="40"
              draggable={false}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
