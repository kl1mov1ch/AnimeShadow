import { useEffect, useRef, useState } from "react";
import { GlyphWatermark, HomeContainer, useCountUp } from "./home-ui";

/**
 * One figure: the number counts up the first time the band is scrolled to,
 * `prefix`/`suffix` carry whatever is not a digit ("500K+", "99.9%").
 */
interface Stat {
  value: number;
  decimals?: number;
  suffix?: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 1000, suffix: "+", label: "Аниме в каталоге" },
  { value: 500, suffix: "K+", label: "Активных пользователей" },
  { value: 99.9, decimals: 1, suffix: "%", label: "Стабильная работа" },
  { value: 24, suffix: "/7", label: "Поддержка" },
];

/**
 * The numbers band: the red storm playing behind it, the figures counting
 * themselves up as it comes into view, each one lighting up under the
 * pointer.
 */
export function StatsSection() {
  const ref = useRef<HTMLElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setLive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg-alt)] py-16"
    >
      {/* The animation only starts downloading when the band is near. */}
      <img
        src={live ? "/home/glow-anim.webp" : "/home/glow-still.webp"}
        alt=""
        loading="lazy"
        aria-hidden
        className="absolute inset-0 size-full scale-110 object-cover opacity-80 transition-opacity duration-1000"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--hm-bg) 0%, color-mix(in srgb, var(--hm-bg) 72%, transparent) 42%, color-mix(in srgb, var(--hm-bg) 30%, transparent) 100%)",
        }}
      />
      <GlyphWatermark className="right-6 top-1/2 -translate-y-1/2 text-[18rem] leading-none" />

      <HomeContainer className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
        <h2 className="home-display text-3xl leading-tight text-[var(--hm-text)] sm:text-[34px]">
          Цифры говорят
          <br />
          сами за себя
        </h2>
        <dl className="grid grid-cols-2 gap-y-8 sm:grid-cols-4">
          {STATS.map((stat, i) => (
            <StatCell key={stat.label} stat={stat} live={live} first={i === 0} />
          ))}
        </dl>
      </HomeContainer>
    </section>
  );
}

function StatCell({ stat, live, first }: { stat: Stat; live: boolean; first: boolean }) {
  const value = useCountUp(stat.value, live);
  return (
    <div
      className={
        (first ? "px-2 sm:px-6" : "border-l border-[var(--hm-border)] px-2 sm:px-6") +
        " group cursor-default"
      }
    >
      <dd className="home-display text-3xl leading-none text-[var(--hm-text)] tabular-nums transition-colors duration-300 group-hover:text-[var(--hm-accent)] sm:text-[34px]">
        {value.toFixed(stat.decimals ?? 0)}
        {stat.suffix}
      </dd>
      <dt className="mt-2 text-xs text-[var(--hm-muted)]">{stat.label}</dt>
      <span
        aria-hidden
        className="mt-2 block h-0.5 w-0 rounded-full bg-[var(--hm-accent)] transition-all duration-500 group-hover:w-12"
      />
    </div>
  );
}
