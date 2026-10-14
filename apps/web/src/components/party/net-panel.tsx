import { GaugeIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NEEDED_MBPS } from "@/components/player/net-stats";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/**
 * The line's speed where the player can't tell us (Kodik's frame): a 384 KB
 * download from our own server every 30 seconds, timed. Small enough not to
 * crowd the episode on a slow line; often enough to follow a change.
 */
export function useSpeedProbe(enabled: boolean): number[] {
  const [history, setHistory] = useState<number[]>([]);
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const started = performance.now();
        const res = await fetch(`${API_BASE}/api/party/speedtest?t=${Date.now()}`, { cache: "no-store" });
        const bytes = (await res.arrayBuffer()).byteLength;
        const seconds = (performance.now() - started) / 1000;
        if (alive && bytes > 0 && seconds > 0) setHistory((h) => [...h.slice(-9), (bytes * 8) / seconds / 1_000_000]);
      } catch {
        // Offline for a moment: the next one tells.
      } finally {
        busy.current = false;
      }
    };
    void run();
    const id = setInterval(() => void run(), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);
  return history;
}

/**
 * Under Kodik's player (which can't show it itself): the line now, what 720p
 * needs, whether it's enough, and a little graph of the last measurements.
 */
export function NetPanel({ history }: { history: number[] }) {
  const speed = history.length ? history[history.length - 1]! : null;
  const need = NEEDED_MBPS[720]!;
  const state = speed == null ? "unknown" : speed >= need * 1.5 ? "good" : speed >= NEEDED_MBPS[480]! ? "tight" : "short";
  const tone = { good: "text-emerald-400", tight: "text-amber-400", short: "text-rose-400", unknown: "text-muted-foreground" }[state];
  const label = { good: "Хватает для 720p и выше", tight: "Впритык — выберите 480p в плеере, если тормозит", short: "Слабый интернет — поставьте 360–480p в плеере", unknown: "Меряем скорость…" }[state];
  const max = Math.max(need * 1.4, ...history, 1);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 px-3 py-2.5">
      <span className="flex items-center gap-2">
        {state === "short" ? <WifiOffIcon className={cn("size-4", tone)} /> : <WifiIcon className={cn("size-4", tone)} />}
        <span className="font-display text-lg tabular-nums leading-none">{speed != null ? speed.toFixed(1) : "—"}</span>
        <span className="text-xs text-muted-foreground">Мбит/с</span>
      </span>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-24" aria-hidden>
        <line x1="0" x2="100" y1={24 - (need / max) * 24} y2={24 - (need / max) * 24} stroke="rgb(251 191 36 / 0.6)" strokeDasharray="3 2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {history.length > 1 && (
          <polyline
            fill="none"
            stroke="currentColor"
            className={tone}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            points={history.map((v, i) => `${(i / (history.length - 1)) * 100},${24 - (Math.min(v, max) / max) * 24}`).join(" ")}
          />
        )}
      </svg>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <GaugeIcon className="size-3.5" />
        720p нужно ~{need} Мбит/с
      </span>
      <span className={cn("text-xs font-medium sm:ml-auto", tone)}>{label}</span>
    </div>
  );
}
