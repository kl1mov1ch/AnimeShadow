import { PlayIcon, XIcon } from "lucide-react";

export function NextEpisodePrompt({
  episode,
  countdown,
  onPlay,
  onCancel,
}: {
  episode: number;
  countdown: number | null;
  onPlay: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-player-next
      className="absolute inset-0 z-30 flex items-end justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 pb-20 sm:p-5 sm:pb-20"
    >
      <div className="relative flex w-full max-w-xs items-center gap-3 overflow-hidden rounded-2xl border border-white/20 bg-black/85 p-3 text-white shadow-xl backdrop-blur-md motion-safe:animate-[player-action-enter_.24s_ease-out_both]">
        <span
          aria-hidden
          className="relative grid size-10 shrink-0 place-items-center text-primary"
        >
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90">
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              opacity=".2"
            />
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={countdown == null ? 0 : (1 - countdown / 5) * 100}
              className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
            />
          </svg>
          <PlayIcon className="size-4 fill-current" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-white/60">
            {countdown == null
              ? "Продолжим историю?"
              : `Продолжим через ${countdown} с`}
          </span>
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex min-h-9 items-center text-left text-sm font-semibold text-white outline-none hover:text-primary focus-visible:underline active:scale-95"
          >
            Серия {episode} · Смотреть
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Отменить переход к следующей серии"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
