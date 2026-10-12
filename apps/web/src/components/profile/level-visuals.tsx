import { CrownIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { LevelInfo } from "./profile-level";

const RING_MASK = (inner: number, outer: number) =>
  `radial-gradient(circle, transparent ${inner}%, #000 ${inner + 4}%, #000 ${outer - 4}%, transparent ${outer}%)`;

/**
 * The level as a medallion, dressed up more the higher it is: a plain disc
 * with a ring filling toward the next level at first, then a halo, a light
 * sweeping across the face, a turning aura, sparks, rays, a crown, a
 * prismatic rim and, at the very top, rising embers. Everything that moves
 * is transform or opacity only, and nothing moves with reduced motion.
 */
export function LevelBadge({
  info,
  size = 56,
  className,
  animated = true,
}: {
  info: LevelInfo;
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const { tier } = info;
  const [c0, c1, c2] = tier.colors;
  const g = tier.grade;
  const small = size < 36;
  const stroke = Math.max(2.5, size / 15);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const digits = String(info.level).length;
  const font = size * (digits <= 2 ? 0.36 : digits === 3 ? 0.29 : 0.23);
  const id = `lvlg-${g}-${size}`;
  const motion = animated ? "" : "lvl-still";

  return (
    <span
      className={cn("lvl relative inline-grid shrink-0 place-items-center", motion, className)}
      style={{ width: size, height: size } as CSSProperties}
      aria-label={`${info.level} уровень · ${tier.name}`}
    >
      {/* The halo. */}
      {g >= 2 && (
        <span aria-hidden className={cn("absolute rounded-full blur-md", g >= 4 && "lvl-pulse")} style={{ inset: "-12%", background: tier.glow }} />
      )}
      {/* A turning aura of the band's colours. */}
      {g >= 6 && (
        <span
          aria-hidden
          className="lvl-spin absolute rounded-full"
          style={
            {
              inset: "-26%",
              "--dur": "9s",
              background: `conic-gradient(from 0deg, transparent, ${c1} 14%, transparent 30%, ${c0} 48%, transparent 64%, ${c2} 80%, transparent)`,
              maskImage: RING_MASK(52, 72),
              WebkitMaskImage: RING_MASK(52, 72),
              opacity: 0.85,
            } as CSSProperties
          }
        />
      )}
      {/* Rays. */}
      {g >= 8 && !small && (
        <span
          aria-hidden
          className="lvl-spin-back absolute rounded-full"
          style={
            {
              inset: "-38%",
              "--dur": "22s",
              background: `repeating-conic-gradient(from 0deg, ${c0} 0deg 5deg, transparent 5deg 18deg)`,
              maskImage: RING_MASK(44, 74),
              WebkitMaskImage: RING_MASK(44, 74),
              opacity: 0.55,
            } as CSSProperties
          }
        />
      )}
      {/* A prismatic rim. */}
      {g >= 10 && (
        <span
          aria-hidden
          className="lvl-spin absolute rounded-full"
          style={
            {
              inset: "-6%",
              "--dur": "5s",
              background: "conic-gradient(from 0deg, #ff4d6d, #fbbf24, #a3e635, #22d3ee, #818cf8, #e879f9, #ff4d6d)",
              maskImage: RING_MASK(86, 100),
              WebkitMaskImage: RING_MASK(86, 100),
            } as CSSProperties
          }
        />
      )}

      {/* Progress to the next level. */}
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c0} />
            <stop offset="55%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, info.progress))}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>

      {/* The face. */}
      <span
        className="relative grid place-items-center overflow-hidden rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.35),inset_0_-4px_10px_rgba(0,0,0,0.35)]"
        style={{
          width: size - stroke * 2 - Math.max(3, size / 16),
          height: size - stroke * 2 - Math.max(3, size / 16),
          background: `radial-gradient(circle at 32% 24%, ${c0}, ${c1} 46%, ${c2} 100%)`,
        }}
      >
        {g >= 4 && (
          <span aria-hidden className="lvl-shine absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        )}
        <span
          className="relative font-display leading-none text-white tabular-nums"
          style={{ fontSize: font, textShadow: `0 1px 2px rgba(0,0,0,0.55), 0 0 10px ${tier.glow}` }}
        >
          {info.level}
        </span>
      </span>

      {/* Sparks. */}
      {g >= 7 &&
        !small &&
        [0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="lvl-twinkle absolute rounded-full bg-white"
            style={
              {
                width: size * 0.07,
                height: size * 0.07,
                left: `${[6, 86, 90, 2][i]}%`,
                top: `${[14, 8, 74, 70][i]}%`,
                boxShadow: `0 0 ${size * 0.12}px ${size * 0.04}px ${c1}`,
                "--dur": `${1.6 + i * 0.45}s`,
                "--delay": `${i * 0.5}s`,
              } as CSSProperties
            }
          />
        ))}
      {/* A crown. */}
      {g >= 9 && !small && (
        <CrownIcon
          aria-hidden
          className="lvl-float absolute"
          style={{
            width: size * 0.34,
            height: size * 0.34,
            top: -size * 0.24,
            color: c0,
            fill: c1,
            filter: `drop-shadow(0 0 ${size * 0.08}px ${tier.glow})`,
          }}
        />
      )}
      {/* Embers, at the very top. */}
      {g >= 11 &&
        !small &&
        [0, 1, 2, 3, 4].map((i) => (
          <span
            key={`e${i}`}
            aria-hidden
            className="lvl-ember absolute rounded-full"
            style={
              {
                width: size * 0.06,
                height: size * 0.06,
                bottom: "8%",
                left: `${[18, 34, 50, 66, 82][i]}%`,
                background: i % 2 ? c1 : c0,
                boxShadow: `0 0 ${size * 0.1}px ${size * 0.03}px ${c1}`,
                "--dur": `${1.8 + (i % 3) * 0.5}s`,
                "--delay": `${i * 0.33}s`,
                "--dx": `${i % 2 ? 1 : -1}`,
              } as CSSProperties
            }
          />
        ))}
    </span>
  );
}

/**
 * The bar to the next level: a track with a tick every tenth, the fill in
 * the band's colours with a light running along it, a glow from the third
 * band on and a bright tip from the sixth; under it the level, how far
 * along, and the next level.
 */
export function LevelBar({
  info,
  labels = true,
  className,
}: {
  info: LevelInfo;
  labels?: boolean;
  className?: string;
}) {
  const [c0, c1, c2] = info.tier.colors;
  const g = info.tier.grade;
  const pct = Math.max(2, info.progress * 100);
  const maxed = info.progress >= 1 && info.ceiling === info.floor;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="relative h-3 overflow-hidden rounded-full bg-black/35 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06]">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: "repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgba(255,255,255,0.07) calc(10% - 1px), rgba(255,255,255,0.07) 10%)" }}
        />
        <span
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${c2}, ${c1} 60%, ${c0})`,
            boxShadow: g >= 3 ? `0 0 14px ${info.tier.glow}` : undefined,
          }}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/25" />
          <span aria-hidden className="lvl-bar-shine absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </span>
        {g >= 6 && (
          <span
            aria-hidden
            className="lvl-pulse absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-[left] duration-1000 ease-out"
            style={{ left: `${pct}%`, boxShadow: `0 0 10px 3px ${c0}` }}
          />
        )}
      </div>
      {labels && (
        <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
          <span className="font-semibold" style={{ color: c1 }}>
            {info.level} ур.
          </span>
          <span className="truncate text-muted-foreground">
            {maxed
              ? "максимальный уровень"
              : `${(info.xp - info.floor).toLocaleString("ru-RU")} / ${(info.ceiling - info.floor).toLocaleString("ru-RU")} опыта`}
          </span>
          {!maxed && <span className="text-muted-foreground">{info.level + 1} ур.</span>}
        </div>
      )}
    </div>
  );
}
