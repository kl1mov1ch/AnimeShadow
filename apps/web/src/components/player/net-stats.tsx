import { ArrowDownIcon, GaugeIcon, WifiIcon, WifiOffIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { requiredMbps } from "@/lib/stream-health";
import { qualityName } from "@/lib/player-quality";

/** Average bitrate each quality really needs (AniLibria's streams, with a little headroom). */

export type NetHealth = "good" | "tight" | "short" | "unknown";

export function netHealth(speed: number | null, needed: number | null, bufferAhead: number): NetHealth {
  if (speed == null || needed == null) return bufferAhead > 10 ? "good" : "unknown";
  if (speed >= needed * 1.5 || bufferAhead > 25) return "good";
  if (speed >= needed || bufferAhead > 10) return "tight";
  return "short";
}

const HEALTH: Record<NetHealth, { label: string; tone: string; dot: string }> = {
  good: { label: "Хватает", tone: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  tight: { label: "Впритык", tone: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
  short: { label: "Не хватает", tone: "bg-rose-500/15 text-rose-300", dot: "bg-rose-400" },
  unknown: { label: "Меряем…", tone: "bg-white/10 text-white/70", dot: "bg-white/50" },
};

const fmt = (mbps: number) => (mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1));

/**
 * The player's corner card about the connection: how fast the line is now
 * (and over the last half minute), what the chosen quality needs, how many
 * seconds are loaded ahead — and plainly whether that's enough. When it
 * isn't, one tap drops to a quality the line can carry. Closed, it stays
 * closed (the signal button in the bar brings it back).
 */
export function NetStats({
  speed,
  history,
  height,
  outputHeight = null,
  bitrate = null,
  playbackRate = 1,
  bufferAhead,
  lowerQuality,
  onLower,
  onClose,
  className,
}: {
  /** Measured line speed, Mbit/s (null while unknown). */
  speed: number | null;
  /** Recent measurements, oldest first, Mbit/s. */
  history: number[];
  /** The picture's quality now (480, 720, 1080), if known. */
  height: number | null;
  outputHeight?: number | null;
  bitrate?: number | null;
  playbackRate?: number;
  /** Seconds loaded past the playhead. */
  bufferAhead: number;
  /** A lower quality to offer when the line is short. */
  lowerQuality: number | null;
  onLower: () => void;
  onClose: () => void;
  className?: string;
}) {
  const needed = requiredMbps(height, bitrate, playbackRate);
  const output = outputHeight && height && outputHeight > height ? outputHeight : null;
  const health = netHealth(speed, needed, bufferAhead);
  const h = HEALTH[health];
  const max = Math.max(needed ?? 0, ...history, 0.5) * 1.15;
  const bufferPct = Math.min(100, (bufferAhead / 30) * 100);

  return (
    <>
    {/* A small player (a phone): nothing over the picture unless there is
        something to do — the line is short and a lower quality would help.
        Then one short pill, never wrapping onto a second row. */}
    {health === "short" && lowerQuality ? (
      <div
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-black/70 py-0.5 pl-2 pr-0.5 text-[10px] text-white shadow-lg backdrop-blur-md @md/player:hidden",
          className,
        )}
        role="status"
        aria-label="Скорость интернета"
      >
        <span className={cn("size-1.5 shrink-0 rounded-full animate-pulse", h.dot)} />
        <span className="font-semibold tabular-nums">{speed != null ? `${fmt(speed)} Мбит/с` : "Мало скорости"}</span>
        <button type="button" onClick={onLower} className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-black">
          {lowerQuality}p
        </button>
        <button type="button" onClick={onClose} aria-label="Скрыть" className="grid size-5 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
          <XIcon className="size-3" />
        </button>
      </div>
    ) : null}

    <div
      className={cn(
        "hidden w-[15.5rem] rounded-2xl border border-white/10 bg-black/65 p-3 text-white shadow-2xl backdrop-blur-md @md/player:block",
        className,
      )}
      role="status"
      aria-label="Скорость интернета"
    >
      <div className="flex items-center gap-2">
        {health === "short" ? <WifiOffIcon className="size-4 text-rose-300" /> : <WifiIcon className="size-4 text-white/80" />}
        <span className="text-xs font-semibold">Интернет</span>
        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", h.tone)}>
          <span className={cn("size-1.5 rounded-full", h.dot, health !== "good" && "animate-pulse")} />
          {h.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Скрыть"
          title="Скрыть — вернуть можно значком сигнала внизу"
          className="-mr-1 grid size-6 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {/* Now, and the last half minute against what's needed. */}
      <div className="mt-2 flex items-end gap-3">
        <div className="shrink-0">
          <p className="font-display text-2xl leading-none tabular-nums">{speed != null ? fmt(speed) : "—"}</p>
          <p className="mt-0.5 text-[10px] text-white/60">Мбит/с сейчас</p>
        </div>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 min-w-0 flex-1" aria-hidden>
          {needed != null && (
            <line x1="0" x2="100" y1={32 - (needed / max) * 32} y2={32 - (needed / max) * 32} stroke="rgb(251 191 36 / 0.7)" strokeDasharray="3 2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
          {history.length > 1 && (
            <polyline
              fill="none"
              stroke={health === "short" ? "rgb(251 113 133)" : health === "tight" ? "rgb(251 191 36)" : "rgb(52 211 153)"}
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              points={history.map((v, i) => `${(i / (history.length - 1)) * 100},${32 - (Math.min(v, max) / max) * 32}`).join(" ")}
            />
          )}
        </svg>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-lg bg-white/[0.06] px-2 py-1.5">
          <dt className="flex items-center gap-1 text-white/55">
            <GaugeIcon className="size-3" />
            Поток{height ? ` ${qualityName(height)}` : ""}
          </dt>
          <dd className="font-semibold tabular-nums">{needed != null ? `~${fmt(needed)} Мбит/с` : "—"}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.06] px-2 py-1.5">
          <dt className="flex items-center gap-1 text-white/55">
            <ArrowDownIcon className="size-3" />
            Запас
          </dt>
          <dd className="font-semibold tabular-nums">{Math.round(bufferAhead)} с</dd>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
            <span
              className={cn("block h-full rounded-full transition-[width] duration-500", bufferAhead > 10 ? "bg-emerald-400" : bufferAhead > 4 ? "bg-amber-400" : "bg-rose-400")}
              style={{ width: `${bufferPct}%` }}
            />
          </span>
        </div>
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed text-white/55">
        {output ? `Вывод ${qualityName(output)} · масштабирование ${qualityName(height!)}. ` : ""}
        {bitrate && bitrate > 0 ? "По битрейту потока, с запасом." : "Оценка, пока битрейт неизвестен."}
        {playbackRate !== 1 ? ` Скорость ${String(playbackRate).replace(".", ",")}× учтена.` : ""}
      </p>

      {health === "short" && lowerQuality && (
        <button
          type="button"
          onClick={onLower}
          className="mt-2.5 w-full rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-transform active:scale-95"
        >
          Снизить до {lowerQuality}p
        </button>
      )}
      {health === "short" && !lowerQuality && (
        <p className="mt-2 text-[11px] leading-snug text-white/70">Скорости мало даже для самого низкого качества — поставьте на паузу, чтобы серия подгрузилась.</p>
      )}
    </div>
    </>
  );
}
