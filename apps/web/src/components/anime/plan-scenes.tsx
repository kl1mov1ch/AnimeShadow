import type { CSSProperties } from "react";

/**
 * A fixed pseudo-random spread, so a scene looks the same on every render
 * and on the server — `Math.random()` here would reshuffle the stars on
 * each re-render and make the backdrop visibly jump.
 */
function spread(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const b = Math.sin((i + 1) * 39.3468 + seed * 11.135) * 24634.6345;
    return { x: a - Math.floor(a), y: b - Math.floor(b), i };
  });
}

/** Shadow — the free tier: a night sky over the dark. */
export function NightScene() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--primary) 18%, transparent) 0%, transparent 60%)",
        }}
      />
      <span
        className="scene-moon absolute right-8 top-6 size-16 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--foreground) 55%, transparent), color-mix(in srgb, var(--foreground) 12%, transparent) 60%, transparent 72%)",
          boxShadow: "0 0 60px 18px color-mix(in srgb, var(--primary) 22%, transparent)",
        }}
      />
      {spread(18, 1).map(({ x, y, i }) => (
        <span
          key={i}
          className="scene-star absolute rounded-full bg-foreground"
          style={
            {
              left: `${x * 100}%`,
              top: `${y * 55}%`,
              width: i % 5 === 0 ? 3 : 2,
              height: i % 5 === 0 ? 3 : 2,
              "--dur": `${2.4 + (i % 4) * 0.7}s`,
              "--delay": `${(i % 7) * 0.45}s`,
            } as CSSProperties
          }
        />
      ))}
      <span
        className="scene-mist absolute -inset-x-1/4 top-[38%] h-16 blur-2xl"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 25%, transparent), transparent)",
        }}
      />
    </span>
  );
}

/** Rōnin — the middle tier: a blade crossing the frame, petals in its wake. */
export function BladeScene() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 55%)",
        }}
      />
      {[0, 1.8, 3.4].map((delay, i) => (
        <span
          key={i}
          className="scene-slash absolute h-px w-2/3 -rotate-[24deg]"
          style={
            {
              top: `${22 + i * 22}%`,
              left: 0,
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 85%, transparent) 60%, transparent)",
              boxShadow: "0 0 12px 2px color-mix(in srgb, var(--primary) 55%, transparent)",
              "--delay": `${delay}s`,
            } as CSSProperties
          }
        />
      ))}
      {spread(9, 2).map(({ x, i }) => (
        <span
          key={i}
          className="scene-petal absolute -top-3 size-2.5 rounded-[60%_0_60%_0]"
          style={
            {
              left: `${x * 95}%`,
              background: "color-mix(in srgb, #f9a8d4 75%, var(--primary))",
              "--dur": `${6 + (i % 4)}s`,
              "--delay": `${(i * 0.9) % 7}s`,
              "--petal-sway": `${i % 2 ? 36 : -28}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Shōgun — the top tier: gold rays turning slowly, embers rising. */
export function CrownScene() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="scene-rays absolute left-1/2 top-[-60%] size-[220%] -translate-x-1/2 opacity-60"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, color-mix(in srgb, #fbbf24 22%, transparent) 0deg 6deg, transparent 6deg 18deg)",
          maskImage: "radial-gradient(circle, black 0%, transparent 42%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 42%)",
        }}
      />
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 50% 0%, color-mix(in srgb, #f59e0b 22%, transparent) 0%, transparent 70%)",
        }}
      />
      {spread(12, 3).map(({ x, i }) => (
        <span
          key={i}
          className="scene-ember absolute bottom-0 size-1.5 rounded-full"
          style={
            {
              left: `${5 + x * 90}%`,
              background: i % 3 ? "#fbbf24" : "#fb923c",
              boxShadow: "0 0 8px 2px color-mix(in srgb, #f59e0b 70%, transparent)",
              "--dur": `${4 + (i % 5) * 0.8}s`,
              "--delay": `${(i * 0.55) % 5}s`,
              "--ember-drift": `${i % 2 ? 14 : -12}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
