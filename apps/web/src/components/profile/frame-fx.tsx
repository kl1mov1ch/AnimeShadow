import type { CSSProperties, ReactNode } from "react";

/**
 * A frame, in two layers that hug the avatar.
 *
 * The first is the rim: a thin band of the frame's colours turning around
 * the avatar's edge, a few pixels wide, with a soft glow. The old frame was
 * a boiling plasma cloud a seventh of the avatar wider on every side, with
 * rays and runes flying further out still — it was bigger than the face it
 * framed. This one stays on the edge.
 *
 * The second is what happens *on* the avatar, and it is what makes each
 * frame its own: flames licking up from the bottom of the ember, bubbles
 * rising through the tide, petals drifting down across the sakura, stars
 * blinking on midnight's rim, lightning cracking on the marathon, ink
 * running down from the top of the inkwell, runes walking the archive's
 * rim, sparkles in every colour on the spectrum, a shadow passing over the
 * eclipse, a gold glint sweeping across the aurum. It is clipped to the
 * frame's circle, so nothing ever leaves it.
 *
 * Positions are fixed per index (no randomness), so a frame looks the same
 * on every render; everything is CSS animation and stops under reduced
 * motion.
 */

interface RingSpec {
  colors: string[];
  /** One turn, in seconds; negative turns the other way. */
  turn: number;
  glow: string;
}

const RINGS: Record<string, RingSpec> = {
  ember: { colors: ["#7f1d1d", "#f97316", "#fde047", "#f97316", "#dc2626", "#7f1d1d"], turn: 3.5, glow: "#f97316" },
  tide: { colors: ["#0c4a6e", "#0ea5e9", "#cffafe", "#22d3ee", "#0284c7", "#0c4a6e"], turn: 9, glow: "#0ea5e9" },
  sakura: { colors: ["#f9a8d4", "#fff1f7", "#f472b6", "#fbcfe8", "#ec4899", "#f9a8d4"], turn: 12, glow: "#f472b6" },
  midnight: { colors: ["#1e1b4b", "#6366f1", "#e0e7ff", "#4338ca", "#1e1b4b", "#a5b4fc", "#1e1b4b"], turn: 18, glow: "#6366f1" },
  marathon: { colors: ["#422006", "#facc15", "#fffbe0", "#422006", "#eab308", "#fef08a", "#422006"], turn: 1.6, glow: "#facc15" },
  inkwell: { colors: ["#020617", "#475569", "#f8fafc", "#0f172a", "#94a3b8", "#020617"], turn: 10, glow: "#94a3b8" },
  archive: { colors: ["#451a03", "#d6a35c", "#fdf0d5", "#b45309", "#78350f", "#451a03"], turn: 16, glow: "#d6a35c" },
  spectrum: { colors: ["#f43f5e", "#f59e0b", "#84cc16", "#06b6d4", "#6366f1", "#d946ef", "#f43f5e"], turn: 5, glow: "#d946ef" },
  eclipse: { colors: ["#000000", "#1e1b4b", "#ffffff", "#a855f7", "#000000", "#000000"], turn: -14, glow: "#a855f7" },
  aurum: { colors: ["#78350f", "#fbbf24", "#fffbeb", "#d97706", "#fde68a", "#78350f"], turn: 7, glow: "#fbbf24" },
};

/** The band sits where the avatar's edge meets the frame box's rim. */
const BAND = "radial-gradient(closest-side, transparent 88%, #000 90.5%, #000 98%, transparent 100%)";

export function hasFrame(frame: string): boolean {
  return frame in RINGS;
}

export function frameGlow(frame: string): string {
  return RINGS[frame]?.glow ?? "var(--primary)";
}

/** The rim — drawn under the avatar, showing only past its edge. */
export function FrameRing({ frame }: { frame: string }) {
  const ring = RINGS[frame];
  if (!ring) return null;
  const style = {
    "--dur": `${Math.abs(ring.turn)}s`,
    background: `conic-gradient(${ring.colors.join(", ")})`,
    maskImage: BAND,
    WebkitMaskImage: BAND,
  } as CSSProperties;
  const spin = ring.turn < 0 ? "ach-spin-back" : "ach-spin";
  return (
    <span aria-hidden className="pointer-events-none absolute -inset-[8%]">
      {/* The glow is a blurred copy of the band, so it follows the colours
          round instead of being one flat halo. */}
      <span className={`${spin} absolute inset-0 rounded-full opacity-70 blur-[4px]`} style={style} />
      <span className={`${spin} absolute inset-0 rounded-full`} style={style} />
    </span>
  );
}

/** What moves on the avatar — above it, clipped to the frame's circle. */
export function FrameFx({ frame, small = false }: { frame: string; small?: boolean }) {
  // Distances are in px so the motion keeps its pace at any avatar size;
  // a thumbnail gets shorter trips and fewer particles.
  const travel = (full: number) => `${small ? Math.round(full * 0.4) : full}px`;
  const n = (full: number) => (small ? Math.ceil(full / 2) : full);
  const list = (count: number) => Array.from({ length: count }, (_, i) => i);

  switch (frame) {
    case "ember":
      return (
        <Clip>
          <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-orange-600/45 to-transparent" />
          {list(n(8)).map((i) => (
            <span
              key={i}
              className="fx-rise absolute bottom-[3%] h-[14%] w-[7%] rounded-[50%_50%_45%_45%/65%_65%_35%_35%]"
              style={vars({
                left: `${16 + ((i * 37) % 64)}%`,
                background: "radial-gradient(ellipse at 50% 80%, #fff7c2, #fbbf24 35%, #f97316 65%, transparent 72%)",
                filter: "drop-shadow(0 0 3px #f97316)",
                "--travel": travel(34 + (i % 3) * 8),
                "--dx": `${i % 2 ? 4 : -4}px`,
                "--dur": `${1.3 + (i % 3) * 0.35}s`,
                "--delay": `${(i * 0.23) % 1.4}s`,
              })}
            />
          ))}
        </Clip>
      );
    case "tide":
      return (
        <Clip>
          <span className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-sky-500/35 to-transparent" />
          {list(n(9)).map((i) => (
            <span
              key={i}
              className="fx-rise absolute bottom-[2%] rounded-full border border-cyan-100/90 bg-cyan-200/15"
              style={vars({
                left: `${12 + ((i * 29) % 74)}%`,
                width: `${4 + (i % 3) * 2}%`,
                aspectRatio: "1",
                "--travel": travel(50 + (i % 4) * 12),
                "--dx": `${i % 2 ? 6 : -6}px`,
                "--dur": `${2.4 + (i % 3) * 0.7}s`,
                "--delay": `${(i * 0.41) % 2.4}s`,
              })}
            />
          ))}
        </Clip>
      );
    case "sakura":
      return (
        <Clip>
          {list(n(8)).map((i) => (
            <span
              key={i}
              className="fx-fall absolute top-[-8%] h-[8%] w-[8%] rounded-[70%_0_70%_0]"
              style={vars({
                left: `${6 + ((i * 41) % 84)}%`,
                background: i % 3 ? "#f9a8d4" : "#fff1f7",
                boxShadow: "0 0 4px rgba(244,114,182,0.7)",
                "--travel": travel(130),
                "--dx": `${i % 2 ? 22 : -18}px`,
                "--dur": `${4.2 + (i % 3) * 1.1}s`,
                "--delay": `${(i * 0.7) % 4.2}s`,
              })}
            />
          ))}
        </Clip>
      );
    case "midnight":
      return (
        <Clip>
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(49,46,129,0.45),transparent_55%)]" />
          {list(n(12)).map((i) => {
            const a = (i / 12) * Math.PI * 2 + 0.3;
            const r = 44 - (i % 3) * 5;
            return (
              <span
                key={i}
                className="scene-star absolute size-[3%] rounded-full bg-indigo-50"
                style={vars({
                  left: `${50 + Math.cos(a) * r}%`,
                  top: `${50 + Math.sin(a) * r}%`,
                  boxShadow: "0 0 5px 1px rgba(165,180,252,0.95)",
                  "--dur": `${1.4 + (i % 4) * 0.5}s`,
                  "--delay": `${(i * 0.31) % 2}s`,
                })}
              />
            );
          })}
        </Clip>
      );
    case "marathon":
      return (
        <Clip>
          {list(n(4)).map((i) => {
            const angle = i * 90 + 25;
            return (
              <span key={i} className="absolute inset-0" style={{ rotate: `${angle}deg` }}>
                <svg
                  viewBox="0 0 10 20"
                  className="fx-flash absolute left-1/2 top-[1%] h-[22%] -translate-x-1/2"
                  style={vars({
                    filter: "drop-shadow(0 0 3px #facc15)",
                    "--dur": `${2.2 + (i % 2) * 0.9}s`,
                    "--delay": `${i * 0.55}s`,
                  })}
                >
                  <path d="M6 0 L1 11 H5 L3 20 L9 7 H5 Z" fill="#fef08a" />
                </svg>
              </span>
            );
          })}
        </Clip>
      );
    case "inkwell":
      return (
        <Clip>
          {list(n(6)).map((i) => (
            <span
              key={i}
              className="fx-fall absolute top-[-4%] w-[5%] rounded-b-full rounded-t-[40%] bg-slate-900"
              style={vars({
                left: `${18 + ((i * 31) % 64)}%`,
                height: `${10 + (i % 3) * 4}%`,
                boxShadow: "0 0 0 1px rgba(226,232,240,0.35)",
                "--travel": travel(70 + (i % 3) * 20),
                "--dx": "0px",
                "--spin": "0deg",
                "--dur": `${2.8 + (i % 3) * 0.8}s`,
                "--delay": `${(i * 0.6) % 3}s`,
              })}
            />
          ))}
        </Clip>
      );
    case "archive":
      return (
        <Clip>
          <span className="ach-spin absolute inset-0" style={vars({ "--dur": "22s" })}>
            {list(n(8)).map((i) => (
              <span key={i} className="absolute inset-0" style={{ rotate: `${i * 45}deg` }}>
                <span
                  className="absolute left-1/2 top-[3%] -translate-x-1/2 font-display leading-none text-amber-100"
                  style={{ fontSize: small ? 6 : 11, textShadow: "0 0 5px rgba(252,211,77,0.95)" }}
                >
                  {"影夢光刀心風月空"[i % 8]}
                </span>
              </span>
            ))}
          </span>
        </Clip>
      );
    case "spectrum":
      return (
        <Clip>
          {list(n(10)).map((i) => {
            const a = (i / 10) * Math.PI * 2;
            const hue = (i * 36) % 360;
            return (
              <span
                key={i}
                className="scene-star absolute size-[4%] rotate-45 rounded-[2px]"
                style={vars({
                  left: `${50 + Math.cos(a) * 42}%`,
                  top: `${50 + Math.sin(a) * 42}%`,
                  background: `hsl(${hue} 95% 70%)`,
                  boxShadow: `0 0 6px 1px hsl(${hue} 95% 60%)`,
                  "--dur": `${1.2 + (i % 3) * 0.4}s`,
                  "--delay": `${i * 0.15}s`,
                })}
              />
            );
          })}
        </Clip>
      );
    case "eclipse":
      return (
        <Clip>
          {/* The moon's shadow walking round the face. */}
          <span
            className="ach-spin absolute inset-0"
            style={vars({
              "--dur": "9s",
              background: "radial-gradient(circle at 78% 22%, rgba(0,0,0,0.6), rgba(0,0,0,0.25) 32%, transparent 52%)",
            })}
          />
          <span className="ach-pulse absolute inset-0 rounded-full shadow-[inset_0_0_14px_3px_rgba(168,85,247,0.55)]" />
        </Clip>
      );
    case "aurum":
      return (
        <Clip>
          <span className="ach-shine absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />
          {list(n(4)).map((i) => (
            <span
              key={i}
              className="scene-star absolute size-[6%] bg-amber-100 [clip-path:polygon(50%_0,60%_40%,100%_50%,60%_60%,50%_100%,40%_60%,0_50%,40%_40%)]"
              style={vars({
                left: `${[18, 74, 80, 22][i]}%`,
                top: `${[24, 18, 70, 76][i]}%`,
                filter: "drop-shadow(0 0 3px #fbbf24)",
                "--dur": `${1.8 + i * 0.4}s`,
                "--delay": `${i * 0.5}s`,
              })}
            />
          ))}
        </Clip>
      );
    default:
      return null;
  }
}

/** The frame's own circle — the band's outer edge — and nothing past it. */
function Clip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -inset-[8%] z-10 overflow-hidden rounded-full">
      {children}
    </span>
  );
}

function vars(style: Record<string, string | number>): CSSProperties {
  return style as CSSProperties;
}
