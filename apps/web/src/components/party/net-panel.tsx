import { GaugeIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { requiredMbps } from "@/lib/stream-health";
import { qualityName } from "@/lib/player-quality";
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
export function NetPanel({ history, height = null, bitrate = null, playbackRate = 1 }: { history: number[]; height?: number | null; bitrate?: number | null; playbackRate?: number }) {
  const speed = history.length ? history[history.length - 1]! : null;
  const need = requiredMbps(height, bitrate, playbackRate);
  const state = speed == null || need == null ? "unknown" : speed >= need * 1.5 ? "good" : speed >= need ? "tight" : "short";
  const tone = { good: "text-emerald-400", tight: "text-amber-400", short: "text-rose-400", unknown: "text-muted-foreground" }[state];
  const label = { good: "Хватает для выбранного потока", tight: "Впритык — при остановках снизьте качество", short: "Слабый интернет — снизьте качество или подождите загрузки", unknown: "Собираем данные потока…" }[state];
  const max = Math.max((need ?? 0) * 1.4, ...history, 1);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 px-3 py-2.5">
      <span className="flex items-center gap-2">
        {state === "short" ? <WifiOffIcon className={cn("size-4", tone)} /> : <WifiIcon className={cn("size-4", tone)} />}
        <span className="font-display text-lg tabular-nums leading-none">{speed != null ? speed.toFixed(1) : "—"}</span>
        <span className="text-xs text-muted-foreground">Мбит/с</span>
      </span>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-24" aria-hidden>
        {need != null && <line x1="0" x2="100" y1={24 - (need / max) * 24} y2={24 - (need / max) * 24} stroke="rgb(251 191 36 / 0.6)" strokeDasharray="3 2" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
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
        {height ? `${qualityName(height)} · ` : ""}{need != null ? `нужно ~${need.toFixed(1)} Мбит/с` : "Битрейт пока неизвестен"}
      </span>
      <span className={cn("text-xs font-medium sm:ml-auto", tone)}>{label}</span>
    </div>
  );
}
