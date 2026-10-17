import { useRef } from "react";
import { fitFrameCrop, FULL_FRAME, type FrameCrop } from "@/lib/frame-image";

export function FrameCropEditor({ src, width, height, crop, onChange, disabled }: {
  src: string; width: number; height: number; crop: FrameCrop; onChange: (crop: FrameCrop) => void; disabled: boolean;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <div className="flex flex-col gap-3">
    <p className="text-xs leading-relaxed text-muted-foreground">Оставь в рамке само аниме, убрав интерфейс TikTok и поля. Потяни по изображению, чтобы выделить кадр.</p>
    <div className="flex justify-center rounded-xl bg-black/70 p-2">
      <div className="relative w-fit max-w-full touch-none select-none overflow-hidden rounded-lg" role="group" aria-label="Область кадра"
        onPointerDown={(e) => {
          if (disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          start.current = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current || disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
          const w = Math.abs(x - start.current.x), h = Math.abs(y - start.current.y);
          if (w > 0.03 && h > 0.03) onChange({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: w, height: h });
        }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        <img src={src} alt="Загруженное изображение для выбора кадра" draggable={false} className="block max-h-80 max-w-full object-contain" />
        <span aria-hidden className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_999px_rgb(0_0_0/0.55)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      {[["Весь кадр", FULL_FRAME], ["16:9 / TikTok", fitFrameCrop(width, height)], ["4:3", fitFrameCrop(width, height, 4 / 3)]] .map(([label, value]) => <button key={String(label)} disabled={disabled} type="button" onClick={() => onChange(value as FrameCrop)} className="min-h-10 rounded-lg border border-border px-3 text-xs hover:bg-secondary disabled:opacity-50">{String(label)}</button>)}
    </div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">Точная настройка рамки</summary><div className="mt-2 grid grid-cols-2 gap-3">
      {(["x", "y", "width", "height"] as const).map((key, i) => <label key={key} className="flex min-w-0 flex-col gap-1">{["Сдвиг вправо", "Сдвиг вниз", "Ширина", "Высота"][i]}<input type="range" aria-label={["Сдвиг вправо", "Сдвиг вниз", "Ширина", "Высота"][i]} disabled={disabled} min={key === "x" || key === "y" ? 0 : 5} max={(key === "x" ? 1 - crop.width : key === "y" ? 1 - crop.height : key === "width" ? 1 - crop.x : 1 - crop.y) * 100} step={0.1} value={crop[key] * 100} onChange={(e) => onChange({ ...crop, [key]: Number(e.target.value) / 100 })} className="w-full accent-primary" /></label>)}
    </div></details>
  </div>;
}
