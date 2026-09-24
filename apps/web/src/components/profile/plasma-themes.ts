import type { PlasmaTheme } from "./plasma-ring";

/**
 * The themes.
 *
 * Each gradient is transparent through the middle and only becomes opaque
 * near the rim: that empty centre is the hole the avatar sits in, so the
 * numbers below are where the band starts, peaks and fades.
 */
export const PLASMA_THEMES: Record<string, PlasmaTheme> = {
  // Hot core, orange body, red smoke at the edge.
  ember: {
    stops: [
      { at: 60, color: "#f97316", opacity: 0 },
      { at: 74, color: "#fde68a", opacity: 0.85 },
      { at: 82, color: "#fbbf24" },
      { at: 90, color: "#f97316", opacity: 0.85 },
      { at: 97, color: "#dc2626", opacity: 0.35 },
      { at: 100, color: "#dc2626", opacity: 0 },
    ],
    push: 9,
    boil: 3.2,
    frequency: [0.022, 0.055],
    octaves: 3,
    spin: 0,
    glow: "#f97316",
  },
  // The same ring, moved slowly and pushed half as hard.
  tide: {
    stops: [
      { at: 62, color: "#0ea5e9", opacity: 0 },
      { at: 76, color: "#cffafe", opacity: 0.7 },
      { at: 84, color: "#22d3ee" },
      { at: 92, color: "#0284c7", opacity: 0.8 },
      { at: 100, color: "#0284c7", opacity: 0 },
    ],
    push: 5,
    boil: 9,
    frequency: [0.014, 0.03],
    octaves: 2,
    spin: 26,
    glow: "#0ea5e9",
  },
  // Barely boils; it turns and it glows.
  aurum: {
    stops: [
      { at: 64, color: "#fbbf24", opacity: 0 },
      { at: 78, color: "#fffbeb", opacity: 0.8 },
      { at: 86, color: "#fbbf24" },
      { at: 94, color: "#d97706", opacity: 0.75 },
      { at: 100, color: "#d97706", opacity: 0 },
    ],
    push: 3,
    boil: 14,
    frequency: [0.01, 0.018],
    octaves: 2,
    spin: 18,
    glow: "#fbbf24",
  },
  // Smoke: slow, many octaves, almost no colour.
  midnight: {
    stops: [
      { at: 60, color: "#64748b", opacity: 0 },
      { at: 76, color: "#cbd5e1", opacity: 0.45 },
      { at: 86, color: "#64748b", opacity: 0.8 },
      { at: 95, color: "#0f172a", opacity: 0.7 },
      { at: 100, color: "#0f172a", opacity: 0 },
    ],
    push: 7,
    boil: 16,
    frequency: [0.018, 0.04],
    octaves: 4,
    spin: 40,
    glow: "#334155",
  },
  sakura: {
    stops: [
      { at: 62, color: "#fb7185", opacity: 0 },
      { at: 77, color: "#ffe4e6", opacity: 0.75 },
      { at: 85, color: "#fb7185" },
      { at: 94, color: "#e11d48", opacity: 0.7 },
      { at: 100, color: "#e11d48", opacity: 0 },
    ],
    push: 4,
    boil: 11,
    frequency: [0.013, 0.028],
    octaves: 2,
    spin: 30,
    glow: "#fb7185",
  },
  marathon: {
    stops: [
      { at: 62, color: "#10b981", opacity: 0 },
      { at: 77, color: "#d1fae5", opacity: 0.7 },
      { at: 85, color: "#34d399" },
      { at: 94, color: "#059669", opacity: 0.75 },
      { at: 100, color: "#059669", opacity: 0 },
    ],
    push: 5,
    boil: 8,
    frequency: [0.015, 0.032],
    octaves: 3,
    spin: 24,
    glow: "#10b981",
  },
  inkwell: {
    stops: [
      { at: 62, color: "var(--primary)", opacity: 0 },
      { at: 78, color: "var(--primary)", opacity: 0.55 },
      { at: 87, color: "var(--primary)" },
      { at: 95, color: "var(--primary)", opacity: 0.5 },
      { at: 100, color: "var(--primary)", opacity: 0 },
    ],
    push: 4,
    boil: 10,
    frequency: [0.014, 0.03],
    octaves: 2,
    spin: 22,
    glow: "var(--primary)",
  },
  archive: {
    stops: [
      { at: 66, color: "#f59e0b", opacity: 0 },
      { at: 80, color: "#fcd34d", opacity: 0.6 },
      { at: 88, color: "#f59e0b", opacity: 0.9 },
      { at: 96, color: "#b45309", opacity: 0.5 },
      { at: 100, color: "#b45309", opacity: 0 },
    ],
    push: 2,
    boil: 20,
    frequency: [0.008, 0.02],
    octaves: 2,
    spin: 34,
    glow: "#f59e0b",
  },
  spectrum: {
    stops: [
      { at: 60, color: "var(--primary)", opacity: 0 },
      { at: 72, color: "#0ea5e9", opacity: 0.7 },
      { at: 80, color: "#a855f7", opacity: 0.85 },
      { at: 88, color: "var(--primary)" },
      { at: 95, color: "#f59e0b", opacity: 0.7 },
      { at: 100, color: "#f59e0b", opacity: 0 },
    ],
    push: 6,
    boil: 7,
    frequency: [0.016, 0.034],
    octaves: 3,
    spin: 16,
    glow: "var(--primary)",
  },
  // Dark body, one bright rim — the corona is the only lit part.
  eclipse: {
    stops: [
      { at: 58, color: "#0f172a", opacity: 0 },
      { at: 74, color: "#0f172a", opacity: 0.85 },
      { at: 88, color: "#0f172a", opacity: 0.9 },
      { at: 94, color: "var(--primary)" },
      { at: 100, color: "var(--primary)", opacity: 0 },
    ],
    push: 4,
    boil: 12,
    frequency: [0.012, 0.026],
    octaves: 3,
    spin: 20,
    glow: "var(--primary)",
  },
};
