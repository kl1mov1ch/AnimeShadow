import { SkipForwardIcon } from "lucide-react";

/** Available throughout the marked segment, including while paused. */
export function SkipSegmentButton({
  label,
  actionLabel,
  onSkip,
}: {
  label: string;
  actionLabel?: string;
  playing: boolean;
  onSkip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="player-segment-action absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex min-h-9 max-w-[calc(100%-1rem)] touch-manipulation items-center gap-2 rounded-xl border border-white/20 bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-white active:scale-95 motion-safe:animate-[player-action-enter_.24s_ease-out_both] @lg/player:right-4 @lg/player:top-4 @lg/player:text-sm"
    >
      <SkipForwardIcon className="size-4 shrink-0 text-current" />
      <span className="truncate">{actionLabel ?? `Пропустить ${label}`}</span>
    </button>
  );
}
