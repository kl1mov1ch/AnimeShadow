import { useEffect, useState } from "react";
import { SkipForwardIcon } from "lucide-react";

/** Mount once on entering a marked segment; five wall-clock seconds, even while paused. */
export function SkipSegmentButton({ label, playing, onSkip }: { label: string; playing: boolean; onSkip: () => void }) {
  const [left, setLeft] = useState(5);
  const [started, setStarted] = useState(false);
  useEffect(() => { if (playing) setStarted(true); }, [playing]);
  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, 5 - Math.floor((performance.now() - start) / 1000));
      setLeft(remaining);
      if (!remaining) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [started]);
  if (!started || !left) return null;
  return <button type="button" onClick={onSkip}
    className="absolute bottom-[max(4rem,env(safe-area-inset-bottom))] right-[max(0.5rem,env(safe-area-inset-right))] z-20 flex min-h-10 max-w-[calc(100%-1rem)] items-center gap-2 rounded-xl border border-primary/40 bg-black/75 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md motion-safe:animate-[skip-prompt_5s_ease-out_both] @lg/player:bottom-20 @lg/player:right-4 @lg/player:text-sm">
    <SkipForwardIcon className="size-4 shrink-0 text-primary" />
    <span className="truncate">Пропустить {label}</span>
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] tabular-nums" aria-label={`Осталось ${left} секунд`}>{left}</span>
  </button>;
}
