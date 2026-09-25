import type { ProfileLayout, PublicProfile, Rank } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export type ProgressStyle = ProfileLayout["progressStyle"];
export type ProgressMetric = ProfileLayout["progressMetric"];

export const PROGRESS_STYLES: ProgressStyle[] = ["classic", "fire", "shadow", "sparks", "neon", "sakura", "ice"];
export const PROGRESS_METRICS: ProgressMetric[] = ["rank", "episodes", "titles", "achievements"];

/** The hours each rank starts at — the server's own thresholds. */
const RANK_STEPS: Array<{ rank: Rank; from: number }> = [
  { rank: "NOVICE", from: 0 },
  { rank: "ADVANCED", from: 10 },
  { rank: "EXPERT", from: 100 },
  { rank: "LEGEND", from: 500 },
];
const EPISODE_MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000];
const TITLE_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500];

interface Measure {
  percent: number;
  label: string;
  value: string;
}

/** Where the viewer stands on the chosen measure, as a real position between two real numbers. */
function measure(profile: PublicProfile, metric: ProgressMetric, t: ReturnType<typeof useT>): Measure {
  const stats = profile.stats;
  const between = (value: number, marks: number[]) => {
    const next = marks.find((m) => m > value) ?? marks[marks.length - 1]!;
    const prev = [...marks].reverse().find((m) => m <= value) ?? 0;
    const percent = next === prev ? 100 : ((value - prev) / (next - prev)) * 100;
    return { next, percent: value >= marks[marks.length - 1]! ? 100 : percent };
  };

  if (metric === "episodes") {
    const { next, percent } = between(stats.episodesWatched, EPISODE_MILESTONES);
    return { percent, label: t("profile.progressBar.toEpisodes", { n: next }), value: `${stats.episodesWatched} / ${next}` };
  }
  if (metric === "titles") {
    const { next, percent } = between(stats.titlesCompleted, TITLE_MILESTONES);
    return { percent, label: t("profile.progressBar.toTitles", { n: next }), value: `${stats.titlesCompleted} / ${next}` };
  }
  if (metric === "achievements") {
    const earned = profile.achievements.filter((a) => a.earned).length;
    const total = profile.achievements.length || 1;
    return { percent: (earned / total) * 100, label: t("profile.progressBar.achievements"), value: `${earned} / ${total}` };
  }
  const index = RANK_STEPS.findIndex((s) => s.rank === profile.rank);
  const current = RANK_STEPS[index] ?? RANK_STEPS[0]!;
  const next = RANK_STEPS[index + 1];
  const hours = stats.hoursWatched;
  if (!next) return { percent: 100, label: t("profile.card.maxRank"), value: `${Math.round(hours)} ${t("profile.progressBar.hoursShort")}` };
  return {
    percent: ((hours - current.from) / (next.from - current.from)) * 100,
    label: t("profile.card.nextRank", { rank: t(`profile.rank.${next.rank.toLowerCase()}` as "profile.rank.novice") }),
    value: t("profile.card.hoursLeft", { hours: Math.max(1, Math.ceil(next.from - hours)) }),
  };
}

/**
 * The progress bar under the name, in the style its owner picked and
 * measuring what they chose to show. The bar itself is `ProgressBar` so the
 * studio can preview every style at a fixed fill.
 */
export function ProfileProgress({ profile, className }: { profile: PublicProfile; className?: string }) {
  const t = useT();
  const { percent, label, value } = measure(profile, profile.layout.progressMetric, t);
  return (
    <div className={cn("flex min-w-[12rem] flex-1 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">{value}</span>
      </div>
      <ProgressBar percent={percent} style={profile.layout.progressStyle} />
    </div>
  );
}

const FILL: Record<ProgressStyle, string> = {
  classic: "linear-gradient(90deg, color-mix(in srgb, var(--primary) 55%, transparent), var(--primary))",
  fire: "linear-gradient(90deg, #7f1d1d, #dc2626 35%, #f97316 70%, #fde047)",
  shadow: "linear-gradient(90deg, #07060d, #2e1650 45%, #7c3aed 85%, #c4b5fd)",
  sparks: "linear-gradient(90deg, #0e7490, #22d3ee 60%, #ecfeff)",
  neon: "linear-gradient(90deg, #be185d, #ff2d95 60%, #ffb3d9)",
  sakura: "linear-gradient(90deg, #f9a8d4, #fbcfe8 60%, #fff1f7)",
  ice: "linear-gradient(90deg, #1e3a8a, #60a5fa 55%, #e0f2fe)",
};

const HEAD: Record<ProgressStyle, string> = {
  classic: "var(--primary)",
  fire: "#fde047",
  shadow: "#c4b5fd",
  sparks: "#ecfeff",
  neon: "#ff2d95",
  sakura: "#fbcfe8",
  ice: "#e0f2fe",
};

/**
 * One bar, seven ways to burn. Each style is a fill plus what happens on
 * and above it: flames and embers off a fire bar, smoke drifting over the
 * shadow, sparks jumping off the electric one, a neon pulse, petals falling
 * from the sakura bar, frost glinting across the ice.
 */
export function ProgressBar({
  percent,
  style,
  className,
}: {
  percent: number;
  style: ProgressStyle;
  className?: string;
}) {
  const fill = Math.min(100, Math.max(2, percent));
  const head = HEAD[style];

  return (
    <div className={cn("relative h-3 rounded-full bg-foreground/10", className)}>
      {/* Effects that rise above the bar live outside its clip. */}
      <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: `${fill}%` }}>
        {style === "fire" &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="ach-ember absolute bottom-1 size-1.5 rounded-full"
              style={
                {
                  left: `${10 + i * 15}%`,
                  background: i % 2 ? "#fde047" : "#f97316",
                  boxShadow: "0 0 6px 2px rgba(249,115,22,0.8)",
                  "--dur": `${1.4 + (i % 3) * 0.4}s`,
                  "--delay": `${i * 0.25}s`,
                  "--dx": `${i % 2 ? 4 : -4}px`,
                } as CSSProperties
              }
            />
          ))}
        {style === "sparks" &&
          [0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="scene-star absolute size-1 rounded-full bg-cyan-50"
              style={
                {
                  left: `${15 + i * 18}%`,
                  top: `${i % 2 ? -6 : 14}px`,
                  boxShadow: "0 0 6px 2px rgba(34,211,238,0.9)",
                  "--dur": `${0.8 + (i % 3) * 0.3}s`,
                  "--delay": `${i * 0.2}s`,
                } as CSSProperties
              }
            />
          ))}
        {style === "sakura" &&
          [0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="scene-petal absolute -top-2 size-2 rounded-[60%_0_60%_0] bg-pink-300"
              style={
                {
                  left: `${10 + i * 24}%`,
                  "--dur": `${3 + (i % 2)}s`,
                  "--delay": `${i * 0.8}s`,
                  "--petal-sway": `${i % 2 ? 12 : -12}px`,
                } as CSSProperties
              }
            />
          ))}
        {style === "shadow" && (
          <span
            className="scene-mist absolute -inset-x-2 -inset-y-2 rounded-full blur-md"
            style={{ background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.55), transparent)" }}
          />
        )}
      </div>

      <div className="absolute inset-0 overflow-hidden rounded-full">
        <div
          className={cn("rank-bar relative h-full rounded-full", style === "neon" && "ach-pulse")}
          style={
            {
              "--fill": `${fill}%`,
              background: FILL[style],
              boxShadow:
                style === "neon"
                  ? "0 0 14px 2px rgba(255,45,149,0.8)"
                  : style === "shadow"
                    ? "0 0 12px 2px rgba(124,58,237,0.6)"
                    : style === "fire"
                      ? "0 0 12px 1px rgba(249,115,22,0.6)"
                      : undefined,
            } as CSSProperties
          }
        >
          {(style === "ice" || style === "sparks" || style === "classic") && (
            <span className="ach-shine absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          )}
        </div>
      </div>

      {/* The leading edge: a glowing head where the fill stops. */}
      <span
        className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background", style === "fire" && "ach-flicker")}
        style={{ left: `${fill}%`, background: head, boxShadow: `0 0 10px 3px ${head}` }}
      />
    </div>
  );
}
