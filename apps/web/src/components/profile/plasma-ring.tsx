import type { CSSProperties } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A ring of moving light, distorted by noise.
 *
 * Fire is not a set of strokes — it is a glow whose edge is torn apart and
 * put back together several times a second. So the ring is drawn once, as a
 * soft band of colour, and then pushed around by a fractal noise field
 * (`feTurbulence` → `feDisplacementMap`). Animating the noise's own
 * frequency makes that field boil, which is what produces tongues rather
 * than a wobble.
 *
 * The same machinery runs every theme. What changes between them is the
 * gradient, how hard the noise pushes, and how fast it boils: water is the
 * same ring with a slower, gentler field; smoke is slower still with more
 * octaves; gold barely moves at all and mostly glows.
 */

export interface PlasmaTheme {
  /** Gradient stops across the band, innermost first. */
  stops: Array<{ at: number; color: string; opacity?: number }>;
  /** How far the noise drags the band, in viewBox units. */
  push: number;
  /** Seconds for one boil cycle — lower is more frantic. */
  boil: number;
  /** Noise scale. Two numbers: across and around. */
  frequency: [number, number];
  /** More octaves = finer detail inside the same shape. */
  octaves: number;
  /** Seconds for one full turn of the whole ring; 0 disables it. */
  spin: number;
  /** Outer glow colour. */
  glow: string;
}

export function PlasmaRing({
  theme,
  className,
  style,
}: {
  theme: PlasmaTheme;
  className?: string;
  style?: CSSProperties;
}) {
  // Several of these are on screen at once (the picker shows every frame),
  // and SVG filter ids are global — without a unique id per instance they
  // would all resolve to whichever rendered last.
  const uid = useId().replace(/:/g, "");
  const gradientId = `pr-grad-${uid}`;
  const filterId = `pr-filter-${uid}`;

  const [fx, fy] = theme.frequency;
  // Boiling is a small wander around the base frequency, not a sweep: a big
  // range changes the size of the flames instead of moving them.
  const lo = `${fx} ${fy}`;
  const hi = `${(fx * 1.55).toFixed(4)} ${(fy * 1.35).toFixed(4)}`;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn("size-full overflow-visible", className)}
      style={style}
    >
      <defs>
        <radialGradient id={gradientId}>
          {theme.stops.map((stop) => (
            <stop
              key={stop.at}
              offset={`${stop.at}%`}
              stopColor={stop.color}
              stopOpacity={stop.opacity ?? 1}
            />
          ))}
        </radialGradient>

        {/* The region has to be roomier than the shape: the displacement
            throws pixels outside the default filter box, and anything that
            lands there is simply cut off. */}
        <filter
          id={filterId}
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={lo}
            numOctaves={theme.octaves}
            seed="11"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur={`${theme.boil}s`}
              values={`${lo};${hi};${lo}`}
              calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={theme.push}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      {/* The band itself. One circle, filled with the gradient — the ring
          is the gradient's shape, not a stroke, which is what lets the
          noise tear its edge instead of just bending a line. */}
      <g
        className={theme.spin > 0 ? "plasma-spin" : undefined}
        style={theme.spin > 0 ? { animationDuration: `${theme.spin}s` } : undefined}
      >
        <circle cx="50" cy="50" r="46" fill={`url(#${gradientId})`} filter={`url(#${filterId})`} />
      </g>
    </svg>
  );
}
